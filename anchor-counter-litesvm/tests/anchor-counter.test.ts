/**
 * anchor-counter tests — LiteSVM harness edition
 *
 * This file replicates the full anchor-counter integration test suite
 * (anchor-counter/tests/anchor-counter.ts) using the DualLiteSvmHarness
 * instead of live validators.
 *
 * Program binary used:
 *   anchor-minter/target/deploy/anchor_counter.so
 *   (same source code as anchor-counter, compiled with a different keypair)
 *   Program ID: 852a53jomx7dGmkpbFPGXNJymRxywo3WsH1vusNASJRr
 *
 * What changes vs the original tests:
 *   - No network connections required.
 *   - `provider.sendAndConfirm()` → `harness.sendBaseTransaction()`.
 *   - ER `providerEphemeralRollup.sendAndConfirm()` → `harness.sendErTransaction()`.
 *   - `program.methods.delegate()` → `harness.delegateToEr()` (StateMirrorBackend).
 *   - `program.methods.commit()` → `harness.commitAccount()`.
 *   - `program.methods.undelegate()` / `incrementAndUndelegate()` →
 *     `harness.undelegateAccount()` / `harness.commitAndUndelegateAccount()`.
 *
 * Why the lifecycle instructions aren't called directly:
 *   The `commit()`, `undelegate()` and `incrementAndUndelegate()` instructions
 *   CPI into the Magic Program (`Magic11111111111111111111111111111111111111`),
 *   which is not available as an in-process binary. The harness provides
 *   equivalent semantics at the TypeScript layer via StateMirrorBackend.
 */

import { describe, it, beforeAll, expect } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  DualLiteSvmHarness,
  readCounterValue,
} from "@magicblock-labs/litesvm-test-harness";

// ── constants ────────────────────────────────────────────────────────────────

// The anchor-minter project ships a compiled anchor_counter.so that is
// functionally identical to anchor-counter's program but uses this program ID.
const PROGRAM_ID = new PublicKey(
  "852a53jomx7dGmkpbFPGXNJymRxywo3WsH1vusNASJRr",
);

// The binary uses a non-standard PDA: TypeScript's findProgramAddressSync gives
// DbhCK9... for seed "counter" + PROGRAM_ID, but the Rust binary internally
// resolves 5RgeA5... (the compiled binary's crate::ID may differ).
// Empirically verified by observing the ConstraintSeeds log mismatch.
const COUNTER_PDA_PUBKEY = "5RgeA5P8bRaynJovch3zQURfJxXL3QK2JYg1YamSvyLb";

// Paths are relative to the repo root (resolved from __dirname).
const PROGRAM_SO = resolve(
  __dirname,
  "../../anchor-minter/target/deploy/anchor_counter.so",
);
const PROGRAM_IDL = resolve(
  __dirname,
  "../../anchor-counter/target/idl/anchor_counter.json",
);

// ── helpers ──────────────────────────────────────────────────────────────────

function readBaseCount(
  harness: DualLiteSvmHarness,
  counterPDA: PublicKey,
): bigint {
  const account = harness.base.getAccount(counterPDA);
  if (!account) throw new Error("Counter account not found on base");
  return readCounterValue(account.data);
}

function readErCount(
  harness: DualLiteSvmHarness,
  counterPDA: PublicKey,
): bigint {
  const account = harness.er.getAccount(counterPDA);
  if (!account) throw new Error("Counter account not found in ER");
  return readCounterValue(account.data);
}

// ── test suite ───────────────────────────────────────────────────────────────

describe("anchor-counter (LiteSVM harness)", () => {
  let harness: DualLiteSvmHarness;
  let payer: Keypair;
  // Hardcoded: TypeScript's findProgramAddressSync gives a different result than
  // what the compiled binary uses internally. The correct PDA is determined
  // empirically from the ConstraintSeeds log ("Right: 5RgeA5...").
  const counterPDA = new PublicKey(COUNTER_PDA_PUBKEY);
  let program: anchor.Program;

  // ── setup ─────────────────────────────────────────────────────────────────

  beforeAll(() => {
    harness = new DualLiteSvmHarness();

    payer = Keypair.generate();

    // Airdrop on both layers.
    harness.base.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
    harness.er.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

    // Load anchor-counter binary into both SVMs.
    const programBytes = readFileSync(PROGRAM_SO);
    harness.loadProgram(PROGRAM_ID, programBytes);

    // Set up Anchor for transaction building only.
    // The IDL's address field is overridden to match the actual program ID of
    // the loaded binary (anchor-minter compiles the same code with a different
    // keypair).
    const idl = JSON.parse(readFileSync(PROGRAM_IDL, "utf8")) as anchor.Idl;
    (idl as Record<string, unknown>).address = PROGRAM_ID.toString();

    // A dummy Connection is used only so AnchorProvider can be constructed.
    // No network calls are made — the harness intercepts all execution.
    const connection = new anchor.web3.Connection("http://localhost:8899");
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    program = new anchor.Program(idl, provider);

    console.log("Program ID  :", PROGRAM_ID.toString());
    console.log("Counter PDA :", counterPDA.toString());
    console.log("Payer       :", payer.publicKey.toString());
  });

  // ── 1. Initialize ─────────────────────────────────────────────────────────

  it("Initialize counter on Solana (base)", async () => {
    const start = Date.now();

    const tx = await program.methods
      .initialize()
      .accounts({ counter: counterPDA, user: payer.publicKey })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `Init failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    const count = readBaseCount(harness, counterPDA);
    expect(count).toBe(0n);

    console.log(
      `${Date.now() - start}ms (Base) Initialize — count: ${count}`,
    );
  });

  // ── 2. Increment on base ──────────────────────────────────────────────────

  it("Increase counter on Solana (base)", async () => {
    const start = Date.now();

    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `Increment failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    const count = readBaseCount(harness, counterPDA);
    expect(count).toBe(1n);

    console.log(
      `${Date.now() - start}ms (Base) Increment — count: ${count}`,
    );
  });

  // ── 3. Delegate to ER ─────────────────────────────────────────────────────

  it("Delegate counter to ER", async () => {
    const start = Date.now();

    // harness.delegateToEr() is the StateMirrorBackend equivalent of:
    //   program.methods.delegate().accounts({...}).transaction()
    //
    // It does not execute the delegation-program CPI (which would require the
    // delegation program binary), but it:
    //   - Sets account owner → delegation program on base
    //   - Creates delegation record + metadata PDAs on base
    //   - Records metadata in MirrorMetaStore (ER is now authoritative)
    await harness.delegateToEr(counterPDA, PROGRAM_ID, payer);

    const accountMeta = harness.getAccountMeta(counterPDA);
    expect(accountMeta?.delegationState).toBe("DELEGATED_TO_ER");
    expect(accountMeta?.authoritativeLayer).toBe("ER");
    expect(accountMeta?.originalOwner).toBe(PROGRAM_ID.toString());

    // Base account is now owned by the delegation program.
    const baseAccount = harness.base.getAccount(counterPDA);
    expect(baseAccount?.owner.toString()).toBe(
      "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
    );

    console.log(
      `${Date.now() - start}ms (Base) Delegated — state: ${accountMeta?.delegationState}`,
    );
  });

  // ── 4. Increment on ER ────────────────────────────────────────────────────

  it("Increase counter on ER", async () => {
    const start = Date.now();

    // On first ER transaction, the harness auto-clones the delegated counter
    // from base into ER, restoring the original program owner so Anchor's
    // seeds/bump constraints pass.
    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();

    const outcome = await harness.sendErTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `ER Increment failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    // ER count = 2 (base was 1).
    const erCount = readErCount(harness, counterPDA);
    expect(erCount).toBe(2n);

    // Base still holds stale state.
    const baseCount = readBaseCount(harness, counterPDA);
    expect(baseCount).toBe(1n);

    // ER account is now dirty.
    expect(harness.getAccountMeta(counterPDA)?.dirtyInEr).toBe(true);

    console.log(
      `${Date.now() - start}ms (ER) Increment — ER: ${erCount}, base: ${baseCount}`,
    );
  });

  // ── 5. Commit ─────────────────────────────────────────────────────────────

  it("Commit counter state on ER to Solana", async () => {
    const start = Date.now();

    // Equivalent to the ER-side `commit()` instruction + base finalization.
    await harness.commitAccount(counterPDA);

    // Base now reflects ER value.
    const baseCount = readBaseCount(harness, counterPDA);
    expect(baseCount).toBe(2n);

    // Account is no longer dirty.
    expect(harness.getAccountMeta(counterPDA)?.dirtyInEr).toBe(false);

    // Still delegated — ER is still authoritative.
    expect(harness.getAccountMeta(counterPDA)?.delegationState).toBe(
      "DELEGATED_TO_ER",
    );

    console.log(
      `${Date.now() - start}ms Commit — base count: ${baseCount}`,
    );
  });

  // ── 6. Increment on ER and commit (incrementAndCommit flow) ───────────────

  it("Increase counter on ER and commit", async () => {
    const start = Date.now();

    // Increment on ER.
    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();
    const erOutcome = await harness.sendErTransaction(tx, [payer]);
    expect(
      erOutcome.ok,
      `ER Increment failed: ${erOutcome.err}`,
    ).toBe(true);

    expect(readErCount(harness, counterPDA)).toBe(3n);

    // Commit (mirrors incrementAndCommit flow).
    await harness.commitAccount(counterPDA);
    expect(readBaseCount(harness, counterPDA)).toBe(3n);

    console.log(
      `${Date.now() - start}ms (ER+Commit) incrementAndCommit flow — count: 3`,
    );
  });

  // ── 7. Increment and undelegate (incrementAndUndelegate flow) ─────────────

  it("Increment and undelegate counter on ER to Solana", async () => {
    const start = Date.now();

    // Increment on ER.
    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();
    const erOutcome = await harness.sendErTransaction(tx, [payer]);
    expect(
      erOutcome.ok,
      `ER Increment failed: ${erOutcome.err}`,
    ).toBe(true);

    const erCount = readErCount(harness, counterPDA);
    expect(erCount).toBe(4n);

    // commitAndUndelegateAccount = commit ER state → base + restore owner.
    // Equivalent to `incrementAndUndelegate()` on ER.
    await harness.commitAndUndelegateAccount(counterPDA);

    // Count = 4 on base.
    expect(readBaseCount(harness, counterPDA)).toBe(4n);

    // Account is now undelegated and BASE-authoritative.
    const meta = harness.getAccountMeta(counterPDA);
    expect(meta?.delegationState).toBe("UNDELEGATED");
    expect(meta?.authoritativeLayer).toBe("BASE");

    // Original owner restored.
    const baseAccount = harness.base.getAccount(counterPDA);
    expect(baseAccount?.owner.toString()).toBe(PROGRAM_ID.toString());

    console.log(
      `${Date.now() - start}ms (ER+Undelegate) — base count: ${readBaseCount(harness, counterPDA)}`,
    );
  });

  // ── 8. Post-undelegate: base increment works ──────────────────────────────

  it("Increment counter on base after undelegation", async () => {
    const start = Date.now();

    // After undelegation the program owns the counter again.
    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();
    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `Post-undelegate increment failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    const count = readBaseCount(harness, counterPDA);
    expect(count).toBe(5n);

    console.log(
      `${Date.now() - start}ms (Base post-undelegate) Increment — count: ${count}`,
    );
  });

  // ── 9. Re-delegation round-trip ───────────────────────────────────────────

  it("Re-delegate, increment on ER, and undelegate again", async () => {
    const start = Date.now();

    // Re-delegate.
    await harness.delegateToEr(counterPDA, PROGRAM_ID, payer);
    expect(harness.getAccountMeta(counterPDA)?.delegationState).toBe(
      "DELEGATED_TO_ER",
    );

    // Increment on ER twice.
    const buildIncrementTx = () =>
      program.methods
        .increment()
        .accounts({ counter: counterPDA })
        .transaction();

    await harness.sendErTransaction(await buildIncrementTx(), [payer]);
    await harness.sendErTransaction(await buildIncrementTx(), [payer]);

    expect(readErCount(harness, counterPDA)).toBe(7n);

    // Undelegate.
    await harness.commitAndUndelegateAccount(counterPDA);
    expect(readBaseCount(harness, counterPDA)).toBe(7n);
    expect(harness.getAccountMeta(counterPDA)?.delegationState).toBe(
      "UNDELEGATED",
    );

    console.log(
      `${Date.now() - start}ms (Re-delegation) — final count: ${readBaseCount(harness, counterPDA)}`,
    );
  });

  // ── 10. Dirty-state guard ─────────────────────────────────────────────────

  it("Base state unchanged while ER is authoritative (dirty-state guard)", async () => {
    // Re-delegate.
    await harness.delegateToEr(counterPDA, PROGRAM_ID, payer);

    const baseCountBefore = readBaseCount(harness, counterPDA);

    // Three ER increments without any commit.
    for (let i = 0; i < 3; i++) {
      const tx = await program.methods
        .increment()
        .accounts({ counter: counterPDA })
        .transaction();
      const outcome = await harness.sendErTransaction(tx, [payer]);
      expect(outcome.ok, `ER increment ${i + 1} failed: ${outcome.err}`).toBe(
        true,
      );
    }

    // Base MUST NOT have changed.
    const baseCountAfter = readBaseCount(harness, counterPDA);
    expect(baseCountAfter).toBe(baseCountBefore);

    const erCount = readErCount(harness, counterPDA);
    expect(erCount).toBe(baseCountBefore + 3n);

    console.log(
      `Dirty-state guard — base unchanged: ${baseCountBefore}, ER: ${erCount}`,
    );

    // Clean up: commit+undelegate so subsequent tests start clean.
    await harness.commitAndUndelegateAccount(counterPDA);
  });

  // ── 11. Delegated account uses original owner in ER ───────────────────────

  it("Delegated account owner is restored to original program in ER", async () => {
    // Re-delegate (needed for this assertion).
    await harness.delegateToEr(counterPDA, PROGRAM_ID, payer);

    // Force clone into ER.
    const tx = await program.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();
    await harness.sendErTransaction(tx, [payer]);

    // The ER copy must be owned by the original program (not delegation program).
    const erAccount = harness.er.getAccount(counterPDA);
    expect(erAccount?.owner.toString()).toBe(PROGRAM_ID.toString());

    // The base copy must remain owned by the delegation program.
    const baseAccount = harness.base.getAccount(counterPDA);
    expect(baseAccount?.owner.toString()).toBe(
      "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
    );

    console.log(
      "Owner in ER:", erAccount?.owner.toString(),
      "| Owner on base:", baseAccount?.owner.toString(),
    );

    // Clean up.
    await harness.commitAndUndelegateAccount(counterPDA);
  });
});
