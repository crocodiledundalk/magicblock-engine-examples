# DualLiteSvmHarness — API Reference

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

## Configuration Reference

```typescript
const harness = new DualLiteSvmHarness({
  erValidatorPubkey?: string,                // default: "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
  delegationProgramId?: string,              // default: "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
  strictProtocolReplay?: boolean,            // default: false (StateMirrorBackend, no DLP needed)
  refreshUndelegatedAccountsEveryTx?: boolean, // default: true
  refreshProgramsEveryTx?: boolean,          // default: false
  splTokenSupport?: boolean,                 // default: false
});
```

## Exposed Properties

```typescript
harness.base   // LiteSVM — base-layer SVM instance (direct access)
harness.er     // LiteSVM — ephemeral rollup SVM instance (direct access)
harness.meta   // MirrorMetaStore — per-account delegation metadata
```

Use `harness.base.getAccount(pubkey)` / `harness.er.getAccount(pubkey)` for raw
account data. Use `harness.getAccountMeta(pubkey)` for delegation state.

## Protocol Modes

### StateMirrorBackend (default, `strictProtocolReplay: false`)

`delegateToEr`, `commitAccount`, `commitAndUndelegateAccount` perform direct
`setAccount()` copies. No DLP binary executed. Suitable for:
- Program logic tests
- CI environments without DLP binaries
- Tests that don't need PDA nonce or undelegatability validation

### ProtocolReplayBackend (`strictProtocolReplay: true`)

**Not yet implemented.** Reserved for future use.

## Account State Machine

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
```

### Account Location After Each Operation

```yaml
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

## Clone Policy

```yaml
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

## sendErTransaction Auto-Apply

```typescript
// Auto-apply: detected lifecycle intents applied immediately
await harness.sendErTransaction(tx, [payer], true);

// Manual (default): inspect intents yourself
const outcome = await harness.sendErTransaction(tx, [payer]);
for (const intent of outcome.intents) {
  if (intent.kind === "COMMIT") {
    for (const acc of intent.accounts) await harness.commitAccount(new PublicKey(acc));
  }
}
```

## PDA Helpers

Exported DLP PDA derivation functions:

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

**Note:** Harness PDA byte layouts use a placeholder discriminator
(`0xdeadbeefcafebabe`) — they do NOT match real on-chain Anchor discriminators.
The `StateMirrorBackend` reads from `MirrorMetaStore`, not decoded PDA bytes.

## readCounterValue Helper

```typescript
import { readCounterValue } from "@magicblock-labs/litesvm-test-harness";
const account = harness.base.getAccount(counterPDA);
const count = readCounterValue(account.data); // returns bigint
```

Layout: `[8-byte discriminator][u64 LE count]`. For other account layouts,
decode the buffer directly.

## What Is NOT Included

- Magic Program binary (`Magic11111111111111111111111111111111111111`)
- Delegation program binary (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`)
- Metaplex token metadata program
- `ProtocolReplayBackend` implementation
- `warpToSlot` / sysvar helpers (use `harness.base.warpToSlot()` directly)

## File Layout

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

## Known Program ID Mismatches

| Source `declare_id!` | Actual binary ID (from keypair) |
|---|---|
| `9RPwaXay...` (anchor-counter/src) | `852a53jo...` (anchor-minter/target/deploy) |
| `DSRodKj1...` (token-minter/src) | `DSRodKj1...` (matches) |
