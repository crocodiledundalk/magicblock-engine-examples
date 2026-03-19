# @magicblock-labs/litesvm-test-harness

In-process test harness for [MagicBlock](https://magicblock.gg) Ephemeral Rollup (ER) flows, powered by [LiteSVM](https://github.com/LiteSVM/litesvm).

## Why this exists

Testing MagicBlock programs normally requires two running validators — a base-layer Solana validator and an ephemeral rollup validator — plus network round-trips for every transaction. This is slow and fragile.

This harness replaces both validators with two in-process LiteSVM instances and wires the delegation lifecycle between them: **delegate → execute on ER → commit → undelegate**.

Everything runs in-process, in milliseconds, with no external infrastructure.

## Installation

```bash
npm install @magicblock-labs/litesvm-test-harness litesvm
# or
yarn add @magicblock-labs/litesvm-test-harness litesvm
```

## Quick start

```ts
import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync } from "fs";

const harness = new DualLiteSvmHarness();

const payer = Keypair.generate();
harness.base.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
harness.er.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

// Load your program into both layers
harness.loadProgramFromFile(PROGRAM_ID, "target/deploy/my_program.so");

// Initialize on base
const initTx = await program.methods.initialize().transaction();
await harness.sendBaseTransaction(initTx, [payer]);

// Delegate to ER
await harness.delegateToEr(myPda, PROGRAM_ID, payer);

// Execute on ER (delegated account is auto-cloned on first use)
const erTx = await program.methods.myAction().transaction();
const outcome = await harness.sendErTransaction(erTx, [payer]);
console.log(outcome.logs);

// Commit ER state back to base
await harness.commitAccount(myPda);

// Verify base state
const baseAccount = harness.base.getAccount(myPda);
```

## Architecture

```
DualLiteSvmHarness
├── base: LiteSVM          – base-layer SVM
├── er: LiteSVM            – ephemeral rollup SVM
├── meta: MirrorMetaStore  – per-account delegation metadata
├── CloneCoordinator       – base→ER hydration policy
├── LifecycleScanner       – intent detection from tx/logs
└── StateMirrorBackend     – ER→base reconciliation (default)
```

## Account state model

| residency              | description |
|------------------------|-------------|
| `BASE_ONLY`            | Exists only on base, not yet cloned to ER |
| `ER_DELEGATED`         | Delegated; primary copy lives in ER |
| `ER_CACHE_UNDELEGATED` | Undelegated but cached in ER for reads |
| `ER_LOCAL_ONLY`        | Created in ER, never on base |
| `TOMBSTONED`           | Removed from ER (e.g. after undelegation) |

## Clone policy

- **Delegated accounts** — cloned from base to ER on first ER transaction reference, then ER is authoritative until commit/undelegate.
- **Undelegated accounts** — cloned from base as a read cache; refreshed before every ER transaction (configurable).
- **Programs** — deployed into both SVMs at setup via `loadProgram` / `loadProgramFromFile`.

## Lifecycle API

### `delegateToEr(account, ownerProgram, payer, seeds?, commitFrequencyMs?)`

Harness-managed delegation (StateMirrorBackend):
- Changes account owner to the delegation program on base.
- Creates delegation record and metadata PDAs on base.
- Records metadata in MirrorMetaStore.

No SVM transaction is executed. This is the right choice when you don't have
the delegation program binary available.

### `sendBaseTransaction(tx, signers)`

Sign and execute a transaction on the base LiteSVM. Returns `TxOutcome`.

### `sendErTransaction(tx, signers, autoApply?)`

Preflight (clone/refresh accounts), sign, and execute on the ER LiteSVM.
Returns `TxOutcome` with detected lifecycle intents.

Set `autoApply = true` to automatically apply detected commit/undelegate
intents to base state after the transaction.

### `commitAccount(account)`

Copy current ER account state to base. Account remains delegated.

Equivalent to the ER-side `commit_accounts()` → base-side finalization flow.

### `undelegateAccount(account)`

Commit ER state to base and restore original program owner.
Account becomes BASE-authoritative again.

### `commitAndUndelegateAccount(account)`

Alias for `undelegateAccount`.

## Configuration

```ts
const harness = new DualLiteSvmHarness({
  erValidatorPubkey: "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev",
  delegationProgramId: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
  strictProtocolReplay: false,          // true = require DLP binary (not yet impl.)
  refreshUndelegatedAccountsEveryTx: true,
  refreshProgramsEveryTx: false,
});
```

## Using with Anchor

The harness works with Anchor's `Program.methods.xxx().transaction()` API.
Build the transaction using Anchor, then hand it to the harness for execution.

```ts
import * as anchor from "@coral-xyz/anchor";
import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";

const harness = new DualLiteSvmHarness();
const payer = Keypair.generate();

harness.base.airdrop(payer.publicKey, BigInt(10e9));

// Anchor setup — we only need a dummy connection for tx building
const connection = new anchor.web3.Connection("http://localhost:8899");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {});
const program = new anchor.Program(idl, provider);

// Build tx (no network call for simple transactions)
const tx = await program.methods.initialize().accounts({ user: payer.publicKey }).transaction();

// Execute via harness
const outcome = await harness.sendBaseTransaction(tx, [payer]);
console.log(outcome.ok, outcome.logs);
```

## Protocol replay vs StateMirrorBackend

The harness ships with two reconciliation backends:

| Backend | What it does | When to use |
|---------|-------------|-------------|
| **StateMirrorBackend** (default) | Direct `setAccount()` copies; no DLP binary needed | Program logic tests, CI |
| **ProtocolReplayBackend** (TODO) | Real DLP CPI; validates PDAs, nonces, undelegatability | Full delegation semantic tests |

The ProtocolReplayBackend requires the delegation program .so and the magic
program .so to be loaded into the respective SVMs. It is not yet implemented;
the interface is reserved for a future release.

## Limitations

- The magic program (`Magic11111111111111111111111111111111111111`) is not
  included. Instructions that CPI directly to it (e.g. `increment_and_commit`)
  will fail unless you load a stub.
- `ProtocolReplayBackend` is not yet implemented.
- Sysvar refresh and `warpToSlot` are exposed via `harness.base.warpToSlot()`.

## See also

- [`anchor-counter-litesvm`](../../anchor-counter-litesvm) — example replicating
  the anchor-counter test suite using this harness.
- [LiteSVM](https://github.com/LiteSVM/litesvm)
- [MagicBlock docs](https://docs.magicblock.gg)
