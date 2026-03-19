/**
 * oncurve-delegation tests — LiteSVM harness edition
 *
 * This file replicates the oncurve-delegation integration test suite
 * (oncurve-delegation/tests/web3js/oncurve-delegation.test.ts) using the
 * DualLiteSvmHarness instead of live validators.
 *
 * On-curve accounts are standard keypair accounts owned by SystemProgram.
 * In production, delegating them requires:
 *   1. SystemProgram.assign() to transfer ownership to the delegation program.
 *   2. The delegation program's `delegate` instruction via CPI.
 *
 * With the LiteSVM harness (StateMirrorBackend mode), harness.delegateToEr()
 * handles both steps in one call — no delegation program binary is needed.
 *
 * What changes vs the original tests:
 *   - No network connections required.
 *   - No dependency on live ER validator or delegation program binary.
 *   - SystemProgram.assign + createDelegateInstruction →
 *     harness.delegateToEr(userPubkey, SystemProgram.programId, payer)
 *   - createCommitInstruction → harness.commitAccount(userPubkey)
 *   - createCommitAndUndelegateInstruction →
 *     harness.commitAndUndelegateAccount(userPubkey)
 */

import { describe, it, beforeAll, expect } from "vitest";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";

// ── test suite ───────────────────────────────────────────────────────────────

describe("oncurve-delegation (LiteSVM harness)", () => {
  let harness: DualLiteSvmHarness;
  let payer: Keypair;
  /** The on-curve account to delegate — a plain keypair, no PDA. */
  let user: Keypair;

  // ── setup ─────────────────────────────────────────────────────────────────

  beforeAll(() => {
    harness = new DualLiteSvmHarness();

    payer = Keypair.generate();
    user = Keypair.generate();

    // Fund both accounts on base.
    harness.base.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
    harness.base.airdrop(user.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    // Fund payer on ER (needed to sign ER transactions).
    harness.er.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

    console.log("Payer:", payer.publicKey.toString());
    console.log("User (on-curve account to delegate):", user.publicKey.toString());
  });

  // ── 1. Assign + Delegate on-curve account ─────────────────────────────────

  it("Assign owner and delegate on-curve account to ER", async () => {
    const start = Date.now();

    // Verify initial state: user account exists on base, owned by System.
    const userAccountBefore = harness.base.getAccount(user.publicKey);
    expect(userAccountBefore).not.toBeNull();
    expect(userAccountBefore?.owner.toString()).toBe(
      SystemProgram.programId.toString(),
    );

    // In production:
    //   1. SystemProgram.assign(user.publicKey, DELEGATION_PROGRAM_ID)
    //   2. delegationProgram.delegate(user.publicKey, SystemProgram.programId)
    //
    // The harness consolidates both steps. It changes base owner to the
    // delegation program, creates delegation record + metadata PDAs, and
    // records the delegation in MirrorMetaStore.
    await harness.delegateToEr(
      user.publicKey,
      SystemProgram.programId,
      payer,
    );

    // Verify post-delegation state.
    const meta = harness.getAccountMeta(user.publicKey);
    expect(meta?.delegationState).toBe("DELEGATED_TO_ER");
    expect(meta?.authoritativeLayer).toBe("ER");
    expect(meta?.originalOwner).toBe(SystemProgram.programId.toString());

    // Base account is now owned by the delegation program.
    const userAccountAfter = harness.base.getAccount(user.publicKey);
    expect(userAccountAfter?.owner.toString()).toBe(
      "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
    );

    // Delegation record PDA should exist on base.
    // (Verified implicitly: delegateToEr would throw if base account not found.)

    console.log(
      `${Date.now() - start}ms Assign+Delegate — state: ${meta?.delegationState}`,
    );
  });

  // ── 2. Commit ─────────────────────────────────────────────────────────────

  it("Commit delegated on-curve account to base", async () => {
    const start = Date.now();

    // Simulate some ER-side mutation of the account balance by directly
    // setting the account in ER (the harness will clone it from base on first
    // access, but we can set it explicitly to test commit).
    const baseAccount = harness.base.getAccount(user.publicKey);
    expect(baseAccount).not.toBeNull();

    // The account is delegated — simulate it being cloned to ER with a
    // modified lamport balance (as if an ER program had transferred SOL).
    const modifiedLamports = BigInt(5 * LAMPORTS_PER_SOL);
    harness.er.setAccount(user.publicKey, {
      ...baseAccount!,
      lamports: Number(modifiedLamports),
      owner: SystemProgram.programId,
    });

    // Mark the meta as delegated and in ER (simulate post-clone state).
    const meta = harness.getAccountMeta(user.publicKey)!;
    meta.residency = "ER_DELEGATED";
    meta.dirtyInEr = true;

    // Commit: copies ER state back to base.
    // Equivalent to production createCommitInstruction flow.
    await harness.commitAccount(user.publicKey);

    // Base should now reflect the ER lamports.
    const baseAccountAfter = harness.base.getAccount(user.publicKey);
    expect(baseAccountAfter?.lamports).toBe(Number(modifiedLamports));

    // Account is no longer dirty.
    expect(harness.getAccountMeta(user.publicKey)?.dirtyInEr).toBe(false);

    // Still delegated — ER remains authoritative.
    expect(harness.getAccountMeta(user.publicKey)?.delegationState).toBe(
      "DELEGATED_TO_ER",
    );

    console.log(
      `${Date.now() - start}ms Commit — base lamports: ${baseAccountAfter?.lamports}`,
    );
  });

  // ── 3. CommitAndUndelegate ─────────────────────────────────────────────────

  it("Commit and undelegate on-curve account back to base", async () => {
    const start = Date.now();

    // Update ER balance again to verify final commit on undelegate.
    const finalLamports = BigInt(2 * LAMPORTS_PER_SOL);
    const erAccount = harness.er.getAccount(user.publicKey);
    harness.er.setAccount(user.publicKey, {
      ...erAccount!,
      lamports: Number(finalLamports),
    });

    // Mark dirty again.
    const meta = harness.getAccountMeta(user.publicKey)!;
    meta.dirtyInEr = true;

    // CommitAndUndelegate: commits ER state to base, then restores original owner.
    // Equivalent to production createCommitAndUndelegateInstruction flow.
    await harness.commitAndUndelegateAccount(user.publicKey);

    // Base should reflect final ER lamports.
    const baseAccountAfter = harness.base.getAccount(user.publicKey);
    expect(baseAccountAfter?.lamports).toBe(Number(finalLamports));

    // Account is now undelegated and BASE-authoritative.
    const metaAfter = harness.getAccountMeta(user.publicKey);
    expect(metaAfter?.delegationState).toBe("UNDELEGATED");
    expect(metaAfter?.authoritativeLayer).toBe("BASE");

    // Original owner (SystemProgram) is restored on base.
    expect(baseAccountAfter?.owner.toString()).toBe(
      SystemProgram.programId.toString(),
    );

    console.log(
      `${Date.now() - start}ms CommitAndUndelegate — owner restored: ${baseAccountAfter?.owner.toString()}`,
    );
  });

  // ── 4. Post-undelegate: base account usable again ─────────────────────────

  it("On-curve account is usable on base after undelegation", async () => {
    // After undelegation the account is owned by SystemProgram again.
    // Verify we can read and inspect it on base normally.
    const baseAccount = harness.base.getAccount(user.publicKey);
    expect(baseAccount).not.toBeNull();
    expect(baseAccount?.owner.toString()).toBe(
      SystemProgram.programId.toString(),
    );

    const meta = harness.getAccountMeta(user.publicKey);
    expect(meta?.delegationState).toBe("UNDELEGATED");
    expect(meta?.dirtyInEr).toBe(false);

    console.log(
      "Post-undelegate owner:", baseAccount?.owner.toString(),
      "| lamports:", baseAccount?.lamports,
    );
  });

  // ── 5. Re-delegation round-trip ───────────────────────────────────────────

  it("Re-delegate, simulate ER changes, and undelegate again", async () => {
    const start = Date.now();

    // Re-delegate the on-curve account.
    await harness.delegateToEr(
      user.publicKey,
      SystemProgram.programId,
      payer,
    );

    expect(harness.getAccountMeta(user.publicKey)?.delegationState).toBe(
      "DELEGATED_TO_ER",
    );

    // Simulate ER changes.
    const newLamports = BigInt(1 * LAMPORTS_PER_SOL);
    const baseAccount = harness.base.getAccount(user.publicKey);
    harness.er.setAccount(user.publicKey, {
      ...baseAccount!,
      lamports: Number(newLamports),
      owner: SystemProgram.programId,
    });

    const meta = harness.getAccountMeta(user.publicKey)!;
    meta.residency = "ER_DELEGATED";
    meta.dirtyInEr = true;

    // Undelegate with commit.
    await harness.commitAndUndelegateAccount(user.publicKey);

    const finalAccount = harness.base.getAccount(user.publicKey);
    expect(finalAccount?.lamports).toBe(Number(newLamports));
    expect(finalAccount?.owner.toString()).toBe(
      SystemProgram.programId.toString(),
    );
    expect(harness.getAccountMeta(user.publicKey)?.delegationState).toBe(
      "UNDELEGATED",
    );

    console.log(
      `${Date.now() - start}ms Re-delegation round-trip — final lamports: ${finalAccount?.lamports}`,
    );
  });
});
