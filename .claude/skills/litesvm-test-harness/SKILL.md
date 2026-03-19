---
name: litesvm-test-harness
description: >
  Write and debug in-process LiteSVM tests for MagicBlock Ephemeral Rollup programs.
  Use when creating new litesvm test packages, debugging test failures involving
  DualLiteSvmHarness, delegation lifecycle, SPL Token support, or program ID mismatches.
user-invocable: true
argument-hint: "[example-package-name]"
allowed-tools: Read, Grep, Glob, Bash
---

# LiteSVM Test Harness Skill

Write in-process TypeScript tests for MagicBlock Ephemeral Rollup (ER) programs
using the `@magicblock-labs/litesvm-test-harness` package and `LiteSVM`.

## Overview

The `DualLiteSvmHarness` runs two `LiteSVM` instances — `base` (Solana L1) and
`er` (ephemeral rollup) — and simulates the delegation lifecycle without a live
network. All execution is in-process via compiled `.so` program binaries.

For full API reference, configuration options, and file layout, see
[reference.md](reference.md).

## When to Use This Skill

- Creating a new `*-litesvm` test package for an existing example program
- Debugging test failures related to delegation, SPL tokens, or program IDs
- Understanding how to test `#[ephemeral]` programs without live infrastructure

## Task: Create Tests for $ARGUMENTS

If an example package name is provided, create a litesvm test package for it
following the patterns below. Otherwise, provide guidance based on the user's
question.

### Step 1: Identify the Program Type

Read the program source to determine:
1. **Framework**: Anchor (has IDL) vs native Rust (no IDL)
2. **Token usage**: Does it CPI into SPL Token / Token-2022?
3. **Ephemeral decorators**: Does it use `#[ephemeral]`, `commit_accounts`, or
   `commit_and_undelegate_accounts`?
4. **External CPIs**: Metaplex, Magic Program, or other binaries needed?

### Step 2: Set Up the Test Package

Follow existing packages as templates (e.g., `anchor-counter-litesvm`,
`spl-tokens-litesvm`). Key files:

```
packages/<name>-litesvm/
├── package.json          # depends on @magicblock-labs/litesvm-test-harness, litesvm
├── tsconfig.json
├── vitest.config.ts
├── src/
│   └── index.test.ts     # main test file
└── fixtures/             # symlink or copy of .so binaries
```

### Step 3: Write Tests Using These Techniques

---

## Technique 1: Basic Harness Setup

```typescript
import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const harness = new DualLiteSvmHarness({
  splTokenSupport: true,  // enable if program uses SPL Token
});
const payer = Keypair.generate();

// CRITICAL: airdrop on BOTH SVMs — they are independent instances
harness.base.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
harness.er.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

// Load program binary into BOTH SVMs
harness.loadProgram(PROGRAM_ID, readFileSync("path/to/program.so"));
```

## Technique 2: Delegation Lifecycle

```typescript
// 1. Initialize on base
await harness.sendBaseTransaction(initTx, [payer]);

// 2. Delegate to ER
await harness.delegateToEr(MY_PDA, PROGRAM_ID, payer);

// 3. Execute on ER
await harness.sendErTransaction(erTx, [payer]);

// 4. Commit ER state back to base (account remains delegated)
await harness.commitAccount(MY_PDA);

// 5. Or commit + undelegate (restores original owner)
await harness.commitAndUndelegateAccount(MY_PDA);
```

The harness uses `StateMirrorBackend` — direct `setAccount()` copies, no DLP
binary required. This is intentional for CI environments.

## Technique 3: Programs with `#[ephemeral]` Cannot Run in LiteSVM

Programs decorated with `#[ephemeral]` crash with `std::bad_alloc` when executed
inside LiteSVM without the Magic Program binary.

**Workaround:** Test program logic directly with raw instructions (e.g.,
`createTransferInstruction` for token transfers) rather than going through the
`#[ephemeral]`-decorated program. Use harness lifecycle API instead of program
CPI:

| Production instruction | Harness equivalent |
|---|---|
| `program.methods.delegate()` | `harness.delegateToEr(pda, ownerProgram, payer)` |
| `commit_accounts(...)` | `harness.commitAccount(pda)` |
| `commit_and_undelegate_accounts(...)` | `harness.commitAndUndelegateAccount(pda)` |

## Technique 4: Program ID Mismatches

Pre-compiled `.so` binaries may embed a different `declare_id!` than what the
source code shows. This causes `ConstraintSeeds` (error 2006) failures.

**Detection:** Anchor error logs print `Left: <derived>, Right: <expected>`.
The `Right` value is the actual PDA the binary expects.

**Fix:** Override the IDL address and hardcode the correct PDA:

```typescript
const idl = JSON.parse(readFileSync(idlPath, "utf8")) as anchor.Idl;
(idl as Record<string, unknown>).address = ACTUAL_PROGRAM_ID.toString();
const counterPDA = new PublicKey("hardcoded-correct-pda");
```

Alternatively derive program ID from keypair:
```bash
cat target/deploy/<program>-keypair.json | python3 -c \
  "import json,sys; from solders.keypair import Keypair; \
   kp=Keypair.from_bytes(json.load(sys.stdin)); print(kp.pubkey())"
```

## Technique 5: SPL Token Support

Pass `{ splTokenSupport: true }` to load SPL Token, Token-2022, and ATA
programs into both SVMs (calls `.withDefaultPrograms().withNativeMints()`).

## Technique 6: Injecting SPL Token Accounts via setAccount

When a program CPIs into an unavailable program (e.g., Metaplex), manually
craft and inject account data:

```typescript
function buildMintData(mintAuthority: PublicKey, decimals: number): Uint8Array {
  const buf = Buffer.alloc(82, 0);
  buf.writeUInt32LE(1, 0);                        // COption::Some
  mintAuthority.toBuffer().copy(buf, 4);           // mint authority
  buf.writeBigUInt64LE(0n, 36);                    // supply
  buf.writeUInt8(decimals, 44);                    // decimals
  buf.writeUInt8(1, 45);                           // is_initialized
  buf.writeUInt32LE(0, 46);                        // freeze_authority: None
  return new Uint8Array(buf);
}
```

Similarly for SPL Token Account (165 bytes). This bypasses the normal mint
lifecycle — only appropriate for testing program logic.

## Technique 7: On-Curve (Keypair) Account Delegation

For on-curve accounts owned by SystemProgram:

```typescript
import { SystemProgram } from "@solana/web3.js";
await harness.delegateToEr(keypairPubkey, SystemProgram.programId, payer);
```

After undelegation, ownership restores to `SystemProgram.programId`.

## Technique 8: SPL Token ATA Delegation

Delegating ATAs works identically to other accounts. The `originalOwner` is
`TOKEN_PROGRAM_ID`:

```typescript
await harness.delegateToEr(ataA, TOKEN_PROGRAM_ID, payer);
// ... SPL transfer on ER ...
await harness.commitAndUndelegateAccount(ataA);
```

The harness delegates the full ATA balance (unlike production `delegateSpl()`).

## Technique 9: Anchor Discriminators Without IDL

Build instructions manually using SHA-256 discriminators:

```typescript
import { createHash } from "crypto";

function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`global:${name}`).digest()
  ).slice(0, 8);
}
```

## Technique 10: Anchor Requires Dummy Connection

Anchor's `AnchorProvider` requires a `Connection` — no network calls are made:

```typescript
const connection = new anchor.web3.Connection("http://localhost:8899");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {});
anchor.setProvider(provider);
```

## Technique 11: Native Rust Tests Without solana-program-test

`solana-program-test` (3.0.x) has compile errors with `solana-program = "2.2.1"`.
For Rust programs, write in-process unit tests that:

1. Call the processor function directly with mock `AccountInfo` objects
2. Test state serialization/deserialization with `borsh`
3. Test instruction decoding with `ProgramInstruction::unpack`
4. Test PDA derivation with `Pubkey::find_program_address`

**Coverage gap:** Instructions requiring `invoke_signed` (system program CPI)
cannot be tested without `solana-program-test`.

---

## Common Failure Modes

1. **Forgot to airdrop on both SVMs** — `harness.base` and `harness.er` are
   independent. Airdrop on both.
2. **Account not found before delegating** — always `sendBaseTransaction` for
   `initialize` before `delegateToEr`.
3. **SPL Token programs not loaded** — use `{ splTokenSupport: true }`.
4. **Duplicate transaction errors** — already mitigated by harness via
   `.withTransactionHistory(0n)`. Only relevant if creating LiteSVM directly.
5. **getAccount() returns null** — check which SVM is authoritative (see
   [reference.md](reference.md) for account state machine).

## Known Limitations

- **Metaplex Token Metadata**: No binary available. `create_token` untestable;
  `mint_token` works with injected mint accounts.
- **DLP/Magic Program CPIs**: Use harness lifecycle API instead.
- **bolt-counter**: Requires `world.so` + component binaries (unavailable).
- **roll-dice**: Requires VRF oracle.
- **pinocchio programs**: `pinocchio::AccountInfo` incompatible with
  `solana_program_test::processor!` macro.

## Existing Test Packages

| Package | Tests | Approach |
|---|---|---|
| `anchor-counter-litesvm` | 11 TypeScript | DualLiteSvmHarness + Anchor IDL |
| `oncurve-delegation-litesvm` | 5 TypeScript | DualLiteSvmHarness (no binary) |
| `anchor-minter-litesvm` | 8 TypeScript | DualLiteSvmHarness + SPL Token |
| `spl-tokens-litesvm` | 7 TypeScript | DualLiteSvmHarness + SPL Token |
| `rust-counter` (tests/) | 19 Rust | Native processor unit tests |
