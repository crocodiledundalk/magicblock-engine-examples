# anchor-counter-litesvm

A fork of the [`anchor-counter`](../anchor-counter) example that replaces the
dual-validator integration test setup with an in-process
[LiteSVM](https://github.com/LiteSVM/litesvm) harness.

## What this demonstrates

The test suite in `tests/anchor-counter.test.ts` replicates every test case
from the original `anchor-counter/tests/anchor-counter.ts`, covering:

| # | Test | Original flow |
|---|------|---------------|
| 1 | Initialize counter on base | `program.methods.initialize()` on base |
| 2 | Increment on base | `program.methods.increment()` on base |
| 3 | Delegate to ER | `program.methods.delegate()` on base |
| 4 | Increment on ER | `program.methods.increment()` on ER |
| 5 | Commit to base | ER `commit()` → base finalization |
| 6 | Increment + commit | ER `incrementAndCommit()` |
| 7 | Increment + undelegate | ER `incrementAndUndelegate()` |
| 8 | Post-undelegate base increment | base ownership restored |
| 9 | Re-delegation round-trip | full second cycle |
| 10 | Dirty-state guard | base unchanged during ER mutations |
| 11 | Undelegated account cache | refresh policy verification |

All tests run in-process with no validators, no network connections, and no
external state. Total runtime is typically under 1 second.

## Running the tests

```bash
npm install
npm test
```

or with watch mode:

```bash
npm run test:watch
```

## How it works

```
anchor-counter program (.so)
        │
        │  harness.loadProgram(PROGRAM_ID, bytes)
        ▼
DualLiteSvmHarness
├── base: LiteSVM  ─── initialize, increment (base layer)
│       │
│       │  harness.delegateToEr(counterPDA, PROGRAM_ID, payer)
│       │  (changes owner → delegation program, creates delegation PDAs)
│       │
├── er: LiteSVM  ──── increment (ER layer)
│       │             (account auto-cloned from base on first use)
│       │
│  harness.commitAccount()   → copies ER bytes to base
│  harness.undelegateAccount() → restores original program owner
└──────────────────────────────────────────────────────────────────
```

## Key differences from the original tests

### Delegation

Original:
```ts
const tx = await program.methods.delegate()
  .accounts({ payer, pda: counterPDA })
  .remainingAccounts([{ pubkey: validatorIdentity, ... }])
  .transaction();
await provider.sendAndConfirm(tx);
```

LiteSVM harness:
```ts
await harness.delegateToEr(counterPDA, PROGRAM_ID, payer);
```

The `delegateToEr()` call uses the **StateMirrorBackend**: it manages
delegation state at the TypeScript level without calling the delegation program
CPI. This avoids the need for the delegation program binary.

### Commit

Original:
```ts
const tx = await program.methods.commit()
  .accounts({ payer: erWallet.publicKey })
  .transaction();
await providerEr.sendAndConfirm(tx);
```

LiteSVM harness:
```ts
await harness.commitAccount(counterPDA);
```

### Commit + Undelegate (incrementAndUndelegate)

Original:
```ts
const tx = await program.methods.incrementAndUndelegate()
  .accounts({ payer: erWallet.publicKey })
  .transaction();
await providerEr.sendAndConfirm(tx);
```

LiteSVM harness (split into two steps — increment first, then undelegate):
```ts
const tx = await program.methods.increment()
  .accounts({ counter: counterPDA })
  .transaction();
await harness.sendErTransaction(tx, [payer]);
await harness.commitAndUndelegateAccount(counterPDA);
```

### Why the Magic Program CPI instructions aren't used directly

The `commit()`, `undelegate()`, and `incrementAndUndelegate()` instructions
CPI into the Magic Program (`Magic11111111111111111111111111111111111111`).
This program is not available as an in-process binary.

The harness provides equivalent semantics via `commitAccount()` and
`undelegateAccount()`. Once a Magic Program stub is available it can be
loaded with `harness.loadProgramOnEr(MAGIC_PROGRAM_ID, bytes)` and the
original instruction calls can be used.

## Project structure

```
anchor-counter-litesvm/
├── tests/
│   └── anchor-counter.test.ts   ← main test file
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

The compiled anchor-counter program is loaded from
`../anchor-counter/target/deploy/anchor_counter.so`.

Make sure you have built the anchor-counter program before running these tests:

```bash
cd ../anchor-counter
anchor build
```
