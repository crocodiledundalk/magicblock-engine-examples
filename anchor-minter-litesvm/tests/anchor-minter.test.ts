/**
 * anchor-minter tests — LiteSVM harness edition
 *
 * This file tests the token-minter program using the DualLiteSvmHarness.
 *
 * Programs used:
 *   anchor-minter/target/deploy/anchor_counter.so
 *     Program ID: 852a53jomx7dGmkpbFPGXNJymRxywo3WsH1vusNASJRr
 *   anchor-minter/target/deploy/token_minter.so
 *     Program ID: HfPTAU1bZBHPqcpEGweinAH9zsPafYnnaxk4k5xsTU3M
 *
 * What changes vs the original tests:
 *   - No network connections required.
 *   - create_token() is NOT tested — it requires the Metaplex metadata
 *     program binary which is not available. Instead, the SPL Token mint
 *     is created directly via setAccount().
 *   - mint_token() IS tested: delegates counter to ER, increments on ER,
 *     commits back to base, then mints tokens based on the committed count.
 *
 * Why create_token is skipped:
 *   The create_token instruction CPIs into the Metaplex token metadata
 *   program (metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s). That binary
 *   is not available in this repo or as a LiteSVM built-in.
 */

import { describe, it, beforeAll, expect } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  DualLiteSvmHarness,
  readCounterValue,
} from "@magicblock-labs/litesvm-test-harness";

// ── constants ────────────────────────────────────────────────────────────────

const COUNTER_PROGRAM_ID = new PublicKey(
  "852a53jomx7dGmkpbFPGXNJymRxywo3WsH1vusNASJRr",
);
// The token_minter keypair derives DSRodKj1..., which matches the declare_id!
// in lib.rs. The Anchor.toml devnet address (HfPTAU1...) is the deployed
// devnet instance using a different keypair; the local binary uses DSRodKj1...
const TOKEN_MINTER_PROGRAM_ID = new PublicKey(
  "DSRodKj1gdLyUJ14gymWeciZiQdT3zH1SN7LWqSHxoqT",
);

// Empirically verified counter PDA (see anchor-counter-litesvm for details).
const COUNTER_PDA_PUBKEY = "5RgeA5P8bRaynJovch3zQURfJxXL3QK2JYg1YamSvyLb";

const COUNTER_SO = resolve(
  __dirname,
  "../../anchor-minter/target/deploy/anchor_counter.so",
);
const TOKEN_MINTER_SO = resolve(
  __dirname,
  "../../anchor-minter/target/deploy/token_minter.so",
);
const COUNTER_IDL = resolve(
  __dirname,
  "../../anchor-counter/target/idl/anchor_counter.json",
);
const TOKEN_MINTER_IDL = resolve(
  __dirname,
  "../../anchor-minter/target/idl/token_minter.json",
);

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal SPL Token Mint account (82 bytes, little-endian).
 *
 * Layout: mint_authority (COption<Pubkey>, 36 bytes) | supply (u64, 8 bytes)
 *         | decimals (u8) | is_initialized (bool) | freeze_authority (COption<Pubkey>, 36 bytes)
 */
function buildMintData(mintAuthority: PublicKey, decimals: number): Uint8Array {
  const buf = Buffer.alloc(82, 0);
  let offset = 0;

  // mint_authority: COption::Some(mintAuthority)
  buf.writeUInt32LE(1, offset);
  offset += 4;
  mintAuthority.toBuffer().copy(buf, offset);
  offset += 32;

  // supply: 0 (u64 LE)
  buf.writeBigUInt64LE(0n, offset);
  offset += 8;

  // decimals
  buf.writeUInt8(decimals, offset);
  offset += 1;

  // is_initialized: true
  buf.writeUInt8(1, offset);
  offset += 1;

  // freeze_authority: COption::None (4 bytes tag + 32 bytes zeros = already zeroed)
  buf.writeUInt32LE(0, offset);

  return new Uint8Array(buf);
}

/**
 * Build a minimal SPL Token Account (165 bytes, little-endian).
 *
 * Layout: mint (32) | owner (32) | amount (u64) | delegate (COption<Pubkey>, 36)
 *         | state (u8) | is_native (COption<u64>, 12) | delegated_amount (u64)
 *         | close_authority (COption<Pubkey>, 36)
 */
function buildTokenAccountData(
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
): Uint8Array {
  const buf = Buffer.alloc(165, 0);
  let offset = 0;

  // mint (32 bytes)
  mint.toBuffer().copy(buf, offset);
  offset += 32;

  // owner (32 bytes)
  owner.toBuffer().copy(buf, offset);
  offset += 32;

  // amount (u64 LE, 8 bytes)
  buf.writeBigUInt64LE(amount, offset);
  offset += 8;

  // delegate: COption::None (4 bytes tag + 32 bytes zeros)
  buf.writeUInt32LE(0, offset);
  offset += 36;

  // state: 1 = initialized
  buf.writeUInt8(1, offset);
  offset += 1;

  // is_native: COption::None (4 + 8 = 12 bytes)
  buf.writeUInt32LE(0, offset);
  offset += 12;

  // delegated_amount: 0 (u64 LE)
  buf.writeBigUInt64LE(0n, offset);
  offset += 8;

  // close_authority: COption::None
  buf.writeUInt32LE(0, offset);

  return new Uint8Array(buf);
}

// ── test suite ───────────────────────────────────────────────────────────────

describe("anchor-minter (LiteSVM harness)", () => {
  let harness: DualLiteSvmHarness;
  let payer: Keypair;
  let counterProgram: anchor.Program;
  let minterProgram: anchor.Program;

  const counterPDA = new PublicKey(COUNTER_PDA_PUBKEY);

  // Mint PDA: seeds = [b"mint"], program = TOKEN_MINTER_PROGRAM_ID
  let mintPDA: PublicKey;
  let mintBump: number;
  let ataAddress: PublicKey;

  // ── setup ─────────────────────────────────────────────────────────────────

  beforeAll(() => {
    harness = new DualLiteSvmHarness({ splTokenSupport: true });

    payer = Keypair.generate();
    harness.base.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
    harness.er.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

    // Load both programs into both SVMs.
    harness.loadProgramFromFile(COUNTER_PROGRAM_ID, COUNTER_SO);
    harness.loadProgramFromFile(TOKEN_MINTER_PROGRAM_ID, TOKEN_MINTER_SO);

    // Build Anchor program objects for transaction construction.
    const connection = new anchor.web3.Connection("http://localhost:8899");
    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(connection, wallet, {});

    const counterIdl = JSON.parse(
      readFileSync(COUNTER_IDL, "utf8"),
    ) as anchor.Idl;
    (counterIdl as Record<string, unknown>).address =
      COUNTER_PROGRAM_ID.toString();
    counterProgram = new anchor.Program(counterIdl, provider);

    const minterIdl = JSON.parse(
      readFileSync(TOKEN_MINTER_IDL, "utf8"),
    ) as anchor.Idl;
    (minterIdl as Record<string, unknown>).address =
      TOKEN_MINTER_PROGRAM_ID.toString();
    minterProgram = new anchor.Program(minterIdl, provider);

    // Derive mint PDA.
    [mintPDA, mintBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      TOKEN_MINTER_PROGRAM_ID,
    );

    console.log("Counter PDA :", counterPDA.toString());
    console.log("Mint PDA    :", mintPDA.toString());
    console.log("Mint bump   :", mintBump);
    console.log("Payer       :", payer.publicKey.toString());
  });

  // ── 1. Initialize counter on base ─────────────────────────────────────────

  it("Initialize counter on base", async () => {
    const tx = await counterProgram.methods
      .initialize()
      .accounts({ counter: counterPDA, user: payer.publicKey })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `Init failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    const account = harness.base.getAccount(counterPDA);
    expect(account).not.toBeNull();
    const count = readCounterValue(account!.data);
    expect(count).toBe(0n);

    console.log("Counter initialized, count:", count);
  });

  // ── 2. Increment counter on base ──────────────────────────────────────────

  it("Increment counter on base (count → 1)", async () => {
    const tx = await counterProgram.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(outcome.ok, `Increment failed: ${outcome.err}`).toBe(true);

    const count = readCounterValue(harness.base.getAccount(counterPDA)!.data);
    expect(count).toBe(1n);

    console.log("Counter incremented, count:", count);
  });

  // ── 3. Delegate counter to ER ─────────────────────────────────────────────

  it("Delegate counter to ER", async () => {
    await harness.delegateToEr(counterPDA, COUNTER_PROGRAM_ID, payer);

    const meta = harness.getAccountMeta(counterPDA);
    expect(meta?.delegationState).toBe("DELEGATED_TO_ER");
    expect(meta?.authoritativeLayer).toBe("ER");

    console.log("Counter delegated to ER");
  });

  // ── 4. Increment counter on ER ────────────────────────────────────────────

  it("Increment counter on ER (count → 2)", async () => {
    const tx = await counterProgram.methods
      .increment()
      .accounts({ counter: counterPDA })
      .transaction();

    const outcome = await harness.sendErTransaction(tx, [payer]);
    expect(outcome.ok, `ER increment failed: ${outcome.err}`).toBe(true);

    const erAccount = harness.er.getAccount(counterPDA);
    expect(erAccount).not.toBeNull();
    const erCount = readCounterValue(erAccount!.data);
    expect(erCount).toBe(2n);

    console.log("Counter incremented on ER, count:", erCount);
  });

  // ── 5. Commit ER state to base ────────────────────────────────────────────

  it("Commit ER counter state to base", async () => {
    await harness.commitAccount(counterPDA);

    // Base now reflects ER count.
    const baseAccount = harness.base.getAccount(counterPDA);
    expect(baseAccount).not.toBeNull();
    const baseCount = readCounterValue(baseAccount!.data);
    expect(baseCount).toBe(2n);

    console.log("Counter committed to base, count:", baseCount);
  });

  // ── 6. Set up SPL Token mint and ATA via setAccount ──────────────────────

  it("Initialize SPL Token mint and ATA for token_minter", async () => {
    // The token_minter program expects a mint PDA at seeds = [b"mint"].
    // create_token() would normally create this, but it requires the Metaplex
    // metadata program binary which is unavailable. Instead, we inject the
    // mint and ATA directly into base via setAccount().
    //
    // The mint_token instruction uses PDA signing with the mint as its own
    // authority, so mint_authority must equal mintPDA.
    const decimals = 0; // whole tokens for easy verification

    const mintRent = Number(
      harness.base.minimumBalanceForRentExemption(BigInt(MINT_SIZE)),
    );
    const ataRent = Number(
      harness.base.minimumBalanceForRentExemption(165n),
    );

    // Set up mint account.
    const mintData = buildMintData(mintPDA, decimals);
    harness.base.setAccount(mintPDA, {
      executable: false,
      owner: TOKEN_PROGRAM_ID,
      lamports: mintRent,
      data: mintData,
    });

    // Pre-create the ATA (amount=0) so init_if_needed just finds it.
    ataAddress = getAssociatedTokenAddressSync(
      mintPDA,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );
    const ataData = buildTokenAccountData(mintPDA, payer.publicKey, 0n);
    harness.base.setAccount(ataAddress, {
      executable: false,
      owner: TOKEN_PROGRAM_ID,
      lamports: ataRent,
      data: ataData,
    });

    const mintAccount = harness.base.getAccount(mintPDA);
    expect(mintAccount).not.toBeNull();
    expect(mintAccount?.owner.toString()).toBe(TOKEN_PROGRAM_ID.toString());

    const ata = harness.base.getAccount(ataAddress);
    expect(ata).not.toBeNull();

    console.log("Mint PDA set up at:", mintPDA.toString());
    console.log("ATA pre-created at:", ataAddress.toString());
  });

  // ── 7. Mint tokens via token_minter ───────────────────────────────────────

  it("Mint 1 token via mint_token (reads committed counter)", async () => {

    const amount = new anchor.BN(1);

    const tx = await minterProgram.methods
      .mintToken(amount)
      .accounts({
        payer: payer.publicKey,
        counter: counterPDA,
        mintAccount: mintPDA,
        associatedTokenAccount: ataAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(
      outcome.ok,
      `mint_token failed: ${outcome.err}\n${outcome.logs.join("\n")}`,
    ).toBe(true);

    // Verify the ATA now exists and holds 1 token.
    const ata = harness.base.getAccount(ataAddress);
    expect(ata).not.toBeNull();

    // SPL Token account layout: mint (32) | owner (32) | amount (u64 at offset 64)
    const ataData = Buffer.from(ata!.data);
    const ataAmount = ataData.readBigUInt64LE(64);
    expect(ataAmount).toBe(1n);

    console.log("Minted 1 token, ATA amount:", ataAmount.toString());
    console.log("Logs:", outcome.logs.filter((l) => l.includes("Counter")));
  });

  // ── 8. Mint more tokens after additional ER increments ────────────────────

  it("Mint 5 more tokens after additional ER increment + commit", async () => {
    // Increment counter on ER twice more.
    const buildTx = () =>
      counterProgram.methods
        .increment()
        .accounts({ counter: counterPDA })
        .transaction();

    await harness.sendErTransaction(await buildTx(), [payer]);
    await harness.sendErTransaction(await buildTx(), [payer]);

    // commit to base (count = 4)
    await harness.commitAccount(counterPDA);
    expect(
      readCounterValue(harness.base.getAccount(counterPDA)!.data),
    ).toBe(4n);

    // Mint 5 more tokens (amount param = 5, decimals = 0 so 5 tokens minted).
    const amount = new anchor.BN(5);
    const tx = await minterProgram.methods
      .mintToken(amount)
      .accounts({
        payer: payer.publicKey,
        counter: counterPDA,
        mintAccount: mintPDA,
        associatedTokenAccount: ataAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    const outcome = await harness.sendBaseTransaction(tx, [payer]);
    expect(outcome.ok, `mint_token failed: ${outcome.err}`).toBe(true);

    const ataData = Buffer.from(harness.base.getAccount(ataAddress)!.data);
    const ataAmount = ataData.readBigUInt64LE(64);
    expect(ataAmount).toBe(6n); // 1 (previous) + 5

    console.log("Total tokens in ATA:", ataAmount.toString());
  });
});
