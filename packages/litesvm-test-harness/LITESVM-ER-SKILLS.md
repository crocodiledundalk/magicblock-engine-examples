---
description: Agent reference for writing and debugging LiteSVM-based ephemeral rollup tests using @magicblock-labs/litesvm-test-harness. Use when creating, modifying, or troubleshooting in-process ER test suites in this repo.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# @magicblock-labs/litesvm-test-harness — Agent Skills Reference

This document is written for AI agents (Claude and others) working with or
integrating this package. It is deliberately explicit and covers failure modes
that are not obvious from the source code or README.

---

## What this package is

An in-process TypeScript test harness for MagicBlock Ephemeral Rollup (ER)
programs. It replaces two live Solana validators with two `LiteSVM` instances
and wires a simulated delegation lifecycle between them.

**It does NOT:**
- Make any network connections.
- Require a running validator, RPC node, or local cluster.
- Execute the real delegation program (DLP) or Magic Program binaries by
  default.

**It DOES:**
- Run your program `.so` binary directly in-process via `LiteSVM`.
- Simulate delegate / commit / undelegate state transitions at the harness
  layer (`StateMirrorBackend`).
- Work with Anchor's `program.methods.xxx().transaction()` API for transaction
  building.

---

## Installation

```yaml
dependencies:
  "@magicblock-labs/litesvm-test-harness": "^0.1.0"
  litesvm: "^0.6.0"

peerDependencies:
  "@solana/web3.js": "^1.98.0"
```

The package has **no monorepo or workspace dependencies**. Copy
`packages/litesvm-test-harness/` and run `npm install` — it builds standalone
with `tsc`.

---

## Minimal working example

```typescript
import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

const PROGRAM_ID = new PublicKey("YourProgramId11111111111111111111111111111111");
const MY_PDA = new PublicKey("YourPdaAddress1111111111111111111111111111111");

const harness = new DualLiteSvmHarness();
const payer = Keypair.generate();

// CRITICAL: airdrop on BOTH SVMs — they are independent instances.
harness.base.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
harness.er.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

// Load program binary into BOTH SVMs.
harness.loadProgram(PROGRAM_ID, readFileSync("target/deploy/my_program.so"));

// Initialize on base.
const initTx = await program.methods.initialize().transaction();
await harness.sendBaseTransaction(initTx, [payer]);

// Delegate the PDA to ER.
await harness.delegateToEr(MY_PDA, PROGRAM_ID, payer);

// Execute on ER — delegated account is auto-cloned on first use.
const erTx = await program.methods.myAction().transaction();
await harness.sendErTransaction(erTx, [payer]);

// Commit ER state back to base (account remains delegated).
await harness.commitAccount(MY_PDA);

// Commit + restore original owner (fully undelegated after this).
await harness.commitAndUndelegateAccount(MY_PDA);
```

---

## Configuration reference

```typescript
const harness = new DualLiteSvmHarness({
  erValidatorPubkey?: string,                // default: "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
  delegationProgramId?: string,              // default: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
  strictProtocolReplay?: boolean,            // default: false — see "Protocol modes" below
  refreshUndelegatedAccountsEveryTx?: boolean, // default: true
  refreshProgramsEveryTx?: boolean,          // default: false
  splTokenSupport?: boolean,                 // default: false — see "SPL Token" below
});
```

```yaml
config_defaults:
  strictProtocolReplay: false          # StateMirrorBackend (no DLP binary required)
  refreshUndelegatedAccountsEveryTx: true  # undelegated accounts re-synced from base before each ER tx
  refreshProgramsEveryTx: false        # programs are static after setup
  splTokenSupport: false               # SPL Token programs not loaded unless requested
```

---

## Exposed properties

```typescript
harness.base   // LiteSVM — base-layer SVM instance (direct access)
harness.er     // LiteSVM — ephemeral rollup SVM instance (direct access)
harness.meta   // MirrorMetaStore — per-account delegation metadata
```

Use `harness.base.getAccount(pubkey)` and `harness.er.getAccount(pubkey)` to
read raw account data. Use `harness.getAccountMeta(pubkey)` to read delegation
state.

---

## Protocol modes

### StateMirrorBackend (default, `strictProtocolReplay: false`)

`delegateToEr`, `commitAccount`, `commitAndUndelegateAccount` perform direct
`setAccount()` copies. No DLP binary is executed. This is suitable for:
- Program logic tests.
- CI environments where DLP binaries are not available.
- Any test that does not need to verify PDA nonces or undelegatability flags.

### ProtocolReplayBackend (`strictProtocolReplay: true`)

**Not yet implemented.** Reserved for future use. Setting `strictProtocolReplay:
true` currently has no effect beyond recording the config value.

---

## Known failure modes

### 1. Forgetting to airdrop on both SVMs

`harness.base` and `harness.er` are fully independent `LiteSVM` instances.
Airdropping on one does NOT affect the other.

```typescript
// WRONG — payer has no SOL in ER, ER transactions will fail
harness.base.airdrop(payer.publicKey, BigInt(10e9));

// CORRECT
harness.base.airdrop(payer.publicKey, BigInt(10e9));
harness.er.airdrop(payer.publicKey, BigInt(10e9));
```

### 2. Programs that CPI into the Magic Program crash LiteSVM

Programs built with `#[ephemeral]` (from `ephemeral-rollups-sdk`) or that call
`commit_accounts()` / `commit_and_undelegate_accounts()` internally will crash
the process with `std::bad_alloc` or `panicked at 'called Option::unwrap() on a
None value'` when executed inside LiteSVM without the Magic Program binary.

**Symptom:** process crash or unrecoverable LiteSVM error (not a clean
`TxOutcome { ok: false }`).

**Solution:** Do not call the program's `commit()` / `undelegate()` /
`incrementAndUndelegate()` instructions via `sendErTransaction`. Instead, use
the harness lifecycle API:

```yaml
production_instruction:        harness_equivalent:
  program.methods.delegate()     harness.delegateToEr(pda, ownerProgram, payer)
  commit_accounts()              harness.commitAccount(pda)
  commit_and_undelegate_accounts() harness.commitAndUndelegateAccount(pda)
```

### 3. Program ID embedded in .so differs from source `declare_id!`

Pre-compiled `.so` files may have been built with a different keypair than the
one shown in the Rust source. TypeScript PDA derivation will produce wrong
addresses, causing `ConstraintSeeds` (error 2006) failures.

**Detection:** Check the error log. Anchor prints:
```
Left: <derived-pda>
Right: <expected-pda>
```
The `Right` value is what the binary actually expects. Use that as your PDA.

**Fix:**
```typescript
// Override IDL address to match the actual binary
const idl = JSON.parse(readFileSync(idlPath, "utf8")) as anchor.Idl;
(idl as Record<string, unknown>).address = ACTUAL_PROGRAM_ID.toString();

// Hardcode the correct PDA rather than re-deriving it
const counterPDA = new PublicKey("5RgeA5P8bRaynJovch3zQURfJxXL3QK2JYg1YamSvyLb");
```

**Known mismatches in this repo:**

| Source `declare_id!` | Actual binary ID (from keypair) |
|---|---|
| `9RPwaXay...` (anchor-counter/src) | `852a53jo...` (anchor-minter/target/deploy) |
| `DSRodKj1...` (token-minter/src) | `DSRodKj1...` (matches) |

### 4. Duplicate transaction errors (already mitigated)

LiteSVM by default rejects transactions with the same signature as a previous
one in its history. The harness constructor calls `.withTransactionHistory(0n)`
on both SVMs, disabling this check. **This is already applied automatically —
no action required.**

If you create LiteSVM instances directly (bypassing `DualLiteSvmHarness`),
remember to call `.withTransactionHistory(0n)` yourself.

### 5. Account not found on base before delegating

`harness.delegateToEr()` requires the account to already exist on base. If you
call it before initializing the account, you will get:

```
Error: delegateToEr: account <pubkey> not found on base. Make sure to initialize it first.
```

**Fix:** Always `sendBaseTransaction` for any `initialize` instruction before
calling `delegateToEr`.

### 6. SPL Token / Token-2022 programs not loaded by default

By default neither `spl_token`, `spl_token_2022`, nor the associated token
program are available in either SVM. Any CPI to these programs will fail
silently (program not found) or produce an `AccountNotFound` error.

**Fix:**
```typescript
const harness = new DualLiteSvmHarness({ splTokenSupport: true });
```
This calls `.withDefaultPrograms().withNativeMints()` on both SVMs.

### 7. `getAccount()` returns null for accounts in the wrong SVM

After `delegateToEr()`, the account is authoritative in ER but the base copy
still exists (owned by the delegation program). After `commitAndUndelegateAccount()`,
the base copy has the original owner restored. ER still holds a stale copy.

```yaml
account_location_guide:
  before_delegation:
    base: exists, owned by your program
    er:   null
  after_delegateToEr + first_sendErTransaction:
    base: exists, owned by DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh
    er:   exists, owned by your program (restored for Anchor constraints)
  after_commitAndUndelegateAccount:
    base: exists, owned by your program (restored)
    er:   stale copy still present (ignore it)
```

### 8. `sendErTransaction` does not auto-apply lifecycle intents by default

`autoApply` defaults to `false`. Detected commit/undelegate intents in
`TxOutcome.intents` are **not** automatically executed against base state unless
you pass `autoApply = true` or call `commitAccount` / `undelegateAccount`
manually.

```typescript
// Auto-apply: detected lifecycle intents are applied immediately after the tx
await harness.sendErTransaction(tx, [payer], true);

// Manual (default): inspect intents and apply yourself
const outcome = await harness.sendErTransaction(tx, [payer]);
for (const intent of outcome.intents) {
  if (intent.kind === "COMMIT") {
    for (const acc of intent.accounts) await harness.commitAccount(new PublicKey(acc));
  }
}
```

### 9. On-curve (keypair) account delegation

On-curve accounts are owned by `SystemProgram`. Pass `SystemProgram.programId`
as the `ownerProgram` argument to `delegateToEr`. After undelegation, ownership
is restored to `SystemProgram.programId`.

```typescript
import { SystemProgram } from "@solana/web3.js";
await harness.delegateToEr(keypairPubkey, SystemProgram.programId, payer);
```

### 10. Anchor requires a dummy Connection even though no network is used

Anchor's `AnchorProvider` constructor requires a `Connection` object.
You must construct one, but **no network calls will be made** — all execution
goes through the harness.

```typescript
// Dummy connection — only used so AnchorProvider can be constructed
const connection = new anchor.web3.Connection("http://localhost:8899");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {});
anchor.setProvider(provider);
```

---

## Techniques used in this repo's test packages

### Injecting SPL Token accounts via setAccount

`create_token` in `token_minter` CPIs to the Metaplex metadata program, which
has no available binary. Without a mint account, `mint_token` cannot be tested.

**Solution:** Manually craft the mint account data and inject it:

```typescript
function buildMintData(mintAuthority: PublicKey, decimals: number): Uint8Array {
  const buf = Buffer.alloc(82, 0);
  buf.writeUInt32LE(1, 0);
  mintAuthority.toBuffer().copy(buf, 4);
  buf.writeBigUInt64LE(0n, 36);
  buf.writeUInt8(decimals, 44);
  buf.writeUInt8(1, 45);
  buf.writeUInt32LE(0, 46);
  return new Uint8Array(buf);
}
```

### Anchor discriminators without an IDL file

```typescript
import { createHash } from "crypto";

function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`global:${name}`).digest()
  ).slice(0, 8);
}
```

### Native Rust tests without solana-program-test

`solana-program-test` (3.0.x) has an internal compile error when paired with
`solana-program = "2.2.1"`. For Rust programs, write in-process unit tests that
call the processor function directly with mock `AccountInfo` objects:

```rust
let counter_info = AccountInfo::new(
    &counter_pda, false, true,
    &mut lamports, &mut data,
    &program_id, false, Epoch::default(),
);
process_increase_counter(&program_id, &accounts, 5).unwrap();
assert_eq!(Counter::try_from_slice(&accounts[1].data.borrow()).unwrap().count, 5);
```

---

## Account state machine

```yaml
residency_states:
  BASE_ONLY:             "Exists only on base; not yet touched by ER"
  ER_DELEGATED:          "Delegated; primary copy lives in ER"
  ER_CACHE_UNDELEGATED:  "Undelegated but cached in ER for read-only access"
  ER_LOCAL_ONLY:         "Created inside ER, never on base"
  TOMBSTONED:            "Removed from ER after undelegation"

delegation_states:
  UNDELEGATED:     "Base is authoritative"
  DELEGATED_TO_ER: "ER is authoritative"
  UNDELEGATING:    "Transition in progress (reserved)"

authoritative_layer:
  BASE: "Read final state from harness.base"
  ER:   "Read final state from harness.er"
```

---

## Clone policy

```yaml
clone_policy:
  delegated_accounts:
    trigger: "First ER transaction that references the account"
    source:  "base"
    owner_on_er: "original program owner (not delegation program)"
    refreshed: false  # ER is authoritative until commit/undelegate

  undelegated_accounts:
    trigger: "Every ER transaction (if refreshUndelegatedAccountsEveryTx: true)"
    source:  "base"
    owner_on_er: "same as base"

  programs:
    trigger: "Setup via loadProgram / loadProgramFromFile"
    note: "Must be loaded explicitly — not auto-cloned from base"
```

---

## PDA helpers

```yaml
pda_seeds:
  delegationRecordPda:   ["delegation",          delegatedAccount]
  delegationMetadataPda: ["delegation-metadata", delegatedAccount]
  bufferPda:             ["buffer",              delegatedAccount]
  commitStatePda:        ["commit-state",        delegatedAccount]
  commitRecordPda:       ["commit-record",       delegatedAccount]
  undelegateBufferPda:   ["undelegate-buffer",   delegatedAccount]
  all_program:           "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
```

**Important:** The harness PDA byte layouts use a simplified internal format
with a placeholder discriminator (`0xdeadbeefcafebabe`). They do **not** match
real on-chain Anchor discriminators. The `StateMirrorBackend` reads state from
`MirrorMetaStore`, so this does not matter for most tests.

---

## readCounterValue helper

```typescript
import { readCounterValue } from "@magicblock-labs/litesvm-test-harness";
const account = harness.base.getAccount(counterPDA);
const count = readCounterValue(account.data); // returns bigint
```

Layout: `[8-byte Anchor discriminator][u64 LE count]`

---

## What is NOT included

```yaml
not_included:
  - Magic Program binary (Magic11111111111111111111111111111111111111)
  - Delegation program binary (DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)
  - Metaplex token metadata program
  - ProtocolReplayBackend (strictProtocolReplay: true is a no-op)
  - warpToSlot / sysvar helpers (use harness.base.warpToSlot() directly)
```

### Programs not covered (require live validator or unavailable binaries)

`session-keys`, `crank-counter`, `magic-actions`, `anchor-rock-paper-scissor`,
`ephemeral-account-chats`, `dummy-token-transfer`, `private-payments`,
`bolt-counter` (needs `world.so`), `roll-dice` (needs VRF oracle),
`pinocchio-counter` / `pinocchio-secret-counter` (pre-existing build failure —
`target/deploy/pinocchio_counter.so` does not exist).

---

## File layout

```
packages/litesvm-test-harness/
├── src/
│   ├── index.ts                  ← public API re-exports
│   ├── types.ts                  ← all TypeScript interfaces and union types
│   ├── constants.ts              ← program IDs, PDA seeds
│   ├── harness/
│   │   └── DualLiteSvmHarness.ts ← main class (start here)
│   ├── clone/
│   │   └── CloneCoordinator.ts   ← base→ER hydration logic
│   ├── dlp/
│   │   ├── accountLayouts.ts     ← encode/decode DLP account data
│   │   └── pda.ts                ← PDA derivation helpers
│   ├── lifecycle/
│   │   ├── IntentExtractor.ts    ← detect delegate/commit/undelegate from tx/logs
│   │   └── LifecycleScanner.ts   ← orchestrates intent extraction
│   ├── metadata/
│   │   └── MirrorMetaStore.ts    ← per-account delegation metadata store
│   ├── protocol/
│   │   └── StateMirrorBackend.ts ← direct-copy ER→base reconciliation
│   └── solana/
│       └── txUtils.ts            ← prepareTransaction, extractAccountKeys, etc.
└── dist/                         ← compiled output (run npm run build)
```
