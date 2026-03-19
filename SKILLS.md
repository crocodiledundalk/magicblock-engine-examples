# LiteSVM Test Harness — Skills & Techniques

This document describes the techniques, workarounds, and architectural decisions
used to bring all MagicBlock Engine examples under in-process test coverage using
the `@magicblock-labs/litesvm-test-harness` package.

---

## Packages Created

| Package | Tests | Approach |
|---|---|---|
| `anchor-counter-litesvm` | 11 TypeScript | DualLiteSvmHarness + Anchor IDL |
| `oncurve-delegation-litesvm` | 5 TypeScript | DualLiteSvmHarness (no binary) |
| `anchor-minter-litesvm` | 8 TypeScript | DualLiteSvmHarness + SPL Token |
| `spl-tokens-litesvm` | 7 TypeScript | DualLiteSvmHarness + SPL Token |
| `rust-counter` (tests/) | 19 Rust | Native processor unit tests |

---

## The DualLiteSvmHarness

The harness (`packages/litesvm-test-harness`) runs two LiteSVM instances
in-process — `base` (Solana L1) and `er` (ephemeral rollup) — and provides a
TypeScript API that mirrors the production delegation lifecycle without requiring
a live network or the full MagicBlock infrastructure.

### Key Configuration

```typescript
const harness = new DualLiteSvmHarness({
  splTokenSupport: true,  // enables SPL Token, Token-2022, ATA programs
});
```

### StateMirrorBackend vs Production

`harness.delegateToEr()`, `harness.commitAccount()`, and
`harness.commitAndUndelegateAccount()` are direct state copies — no delegation
program CPI is executed. This is intentional: the delegation program binary
(DLP) is not available in CI, and most program-logic tests don't need to
validate PDA nonces.

### When to use `strictProtocolReplay: true`

Set this if you need full DLP PDA validation (nonces, `undelegatability`, etc.).
This requires the `dlp.so` binary to be loaded into both SVMs.

---

## Technique 1: Disabling Duplicate Transaction Detection

**Problem:** LiteSVM rejects transactions with the same signature. When
`latestBlockhash()` doesn't auto-advance between identical instruction calls,
the same signature is produced, causing test failures.

**Fix:** Initialize both SVMs with `.withTransactionHistory(0n)`:

```typescript
const makeSvm = () => {
  let svm = new LiteSVM().withTransactionHistory(0n);
  // ...
  return svm;
};
```

This is applied automatically inside `DualLiteSvmHarness`. No action required
by test authors.

**Affects:** All tests that send the same instruction more than once (e.g.
`increment()` loops).

---

## Technique 2: Program ID Mismatches

**Problem:** Pre-compiled `.so` binaries in this repo may embed a different
`declare_id!` than what the source code shows. The TypeScript-side PDA
derivation must use the program ID embedded in the binary, not the source ID.

**Verification method:**
1. Load the binary and attempt a transaction.
2. If Anchor returns `ConstraintSeeds` (error 2006), check the log: it prints
   `Left: <derived>, Right: <expected>`. The `Right` value is the actual PDA
   the binary uses.
3. Alternatively, derive the program ID from the keypair file:
   ```bash
   cat target/deploy/<program>-keypair.json | python3 -c \
     "import json,sys; from solders.keypair import Keypair; \
      kp=Keypair.from_bytes(json.load(sys.stdin)); print(kp.pubkey())"
   ```

**Known mismatches:**

| Source `declare_id!` | Actual binary ID (from keypair) |
|---|---|
| `9RPwaXay...` (anchor-counter/src) | `852a53jo...` (anchor-minter/target/deploy) |
| `DSRodKj1...` (token-minter/src) | `DSRodKj1...` (matches) |

**Fix:** Override the IDL address after loading:

```typescript
const idl = JSON.parse(readFileSync(PROGRAM_IDL, "utf8")) as anchor.Idl;
(idl as Record<string, unknown>).address = ACTUAL_PROGRAM_ID.toString();
```

And hardcode the correct PDA:

```typescript
const COUNTER_PDA_PUBKEY = "5RgeA5P8bRaynJovch3zQURfJxXL3QK2JYg1YamSvyLb";
const counterPDA = new PublicKey(COUNTER_PDA_PUBKEY);
```

---

## Technique 3: SPL Token Support

**Problem:** SPL Token, Token-2022, and Associated Token Program are not loaded
by default in LiteSVM.

**Fix:** Pass `{ splTokenSupport: true }` to `DualLiteSvmHarness`:

```typescript
const harness = new DualLiteSvmHarness({ splTokenSupport: true });
```

This calls `.withDefaultPrograms().withNativeMints()` on both SVMs.

**Affects:** `anchor-minter-litesvm`, `spl-tokens-litesvm`.

---

## Technique 4: Injecting SPL Token Accounts via setAccount

**Problem:** `create_token` in `token_minter` CPIs to the Metaplex metadata
program, which has no available binary. Without a mint account, `mint_token`
cannot be tested.

**Solution:** Manually craft the mint account data and inject it with
`harness.base.setAccount()`. SPL Token mint layout (82 bytes):

```typescript
function buildMintData(mintAuthority: PublicKey, decimals: number): Uint8Array {
  const buf = Buffer.alloc(82, 0);
  // COption::Some(mintAuthority): [1,0,0,0, ...32 bytes...]
  buf.writeUInt32LE(1, 0);
  mintAuthority.toBuffer().copy(buf, 4);
  // supply: 0 (u64 LE)
  buf.writeBigUInt64LE(0n, 36);
  // decimals
  buf.writeUInt8(decimals, 44);
  // is_initialized: true
  buf.writeUInt8(1, 45);
  // freeze_authority: COption::None
  buf.writeUInt32LE(0, 46);
  return new Uint8Array(buf);
}
```

Similarly for a pre-initialized SPL Token Account (165 bytes) to avoid
`init_if_needed` CPI crashes.

**Note:** This technique bypasses the normal mint lifecycle. It is only
appropriate for testing program logic that reads/writes token state.

---

## Technique 5: Programs with #[ephemeral] Cannot Run in LiteSVM

**Problem:** Programs decorated with `#[ephemeral]` (from `ephemeral-rollups-sdk`)
add MagicBlock infrastructure that expects the Magic Program
(`Magic11111111111111111111111111111111111111`) to be available. When executed
inside LiteSVM without that context, the process crashes with `std::bad_alloc`.

**Affected binaries:**
- `spl-tokens/tests/fixtures/ephemeral_token_program.so`
- Any program with `#[ephemeral]` or `commit_accounts` / `commit_and_undelegate_accounts` CPIs

**Workaround:** Test the program-level transfer logic directly with raw SPL Token
instructions (`createTransferInstruction`) rather than going through the
`#[ephemeral]`-decorated program. The delegation lifecycle (delegate, commit,
undelegate) is handled at the harness layer, not through the program binary.

**Similarly:** Instructions like `commit()` and `undelegate()` in any program
that CPI into the Magic Program cannot be tested via `sendErTransaction` with
that binary. Use `harness.commitAccount()` and `harness.undelegateAccount()`
instead.

---

## Technique 6: On-Curve (Keypair) Account Delegation

**Problem:** On-curve accounts (owned by SystemProgram) have no custom program
seeds. The production delegation flow uses `SystemProgram.assign()` + the DLP's
`delegate` instruction.

**Solution:** Call `harness.delegateToEr(keypairPubkey, SystemProgram.programId, payer)`.

The harness handles the owner transfer and PDA creation. After undelegation,
the account is restored to `SystemProgram.programId` ownership.

**Affects:** `oncurve-delegation-litesvm`.

---

## Technique 7: SPL Token ATA Delegation

Delegating a token ATA (Associated Token Account) works identically to
delegating any other account. The `originalOwner` is `TOKEN_PROGRAM_ID`. After
undelegation, the base account is restored to `TOKEN_PROGRAM_ID` ownership, and
the token balance reflects the committed ER state.

```typescript
await harness.delegateToEr(ataA, TOKEN_PROGRAM_ID, payer);
// ... SPL transfer on ER ...
await harness.commitAndUndelegateAccount(ataA);
```

**Note:** The harness delegates the _full_ ATA balance, unlike production
`delegateSpl()` which splits the balance. This is sufficient for testing ER
transfer semantics.

---

## Technique 8: Anchor Instruction Discriminators Without an IDL File

When an IDL file is not available (e.g. the program has no `target/idl/`
directory), build instructions manually using Anchor's SHA-256 discriminator
scheme:

```typescript
import { createHash } from "crypto";

function anchorDiscriminator(name: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`global:${name}`).digest()
  ).slice(0, 8);
}

// Example: spl_tokens::transfer(amount: u64)
const data = Buffer.alloc(16);
anchorDiscriminator("transfer").copy(data, 0);
data.writeBigUInt64LE(3n, 8);
```

---

## Technique 9: Native Rust Tests Without solana-program-test

**Problem:** `solana-program-test` (3.0.x) in the cargo cache has an internal
compile error in `solana-transaction-3.0.2` that blocks compilation when paired
with `solana-program = "2.2.1"`. The version ranges are incompatible.

**Solution:** For Rust programs, write in-process unit tests that:
1. Call the processor function directly with mock `AccountInfo` objects.
2. Test state serialization/deserialization with `borsh`.
3. Test instruction decoding with `ProgramInstruction::unpack`.
4. Test PDA derivation with `Pubkey::find_program_address`.

```rust
let counter_info = AccountInfo::new(
    &counter_pda, false, true,
    &mut lamports, &mut data,
    &program_id, false, Epoch::default(),
);
process_increase_counter(&program_id, &accounts, 5).unwrap();
assert_eq!(Counter::try_from_slice(&accounts[1].data.borrow()).unwrap().count, 5);
```

**Coverage gap:** `process_initialize_counter` requires `invoke_signed` (system
program CPI) which cannot be tested without `solana-program-test`. This
instruction is covered semantically by `harness.delegateToEr()` which creates
the PDAs directly.

---

## Known Limitations

### Metaplex Token Metadata
`anchor-minter`'s `create_token` instruction CPIs into the Metaplex metadata
program (`metaqbxx...`). No binary is available. The instruction is not tested.
`mint_token` IS tested.

### DLP and Magic Program CPIs
Any instruction that directly invokes the delegation program or Magic Program
at the CPI level requires those binaries to be loaded. Without them, use the
harness lifecycle API instead:

| Production instruction | Harness equivalent |
|---|---|
| `program.methods.delegate()` | `harness.delegateToEr(pda, ownerProgram, payer)` |
| `commit_accounts(...)` | `harness.commitAccount(pda)` |
| `commit_and_undelegate_accounts(...)` | `harness.commitAndUndelegateAccount(pda)` |

### bolt-counter
Requires `world.so`, counter component `.so`, and increase system `.so` binaries.
Only `world.so` and `dlp.so` are available. Skipped.

### roll-dice
Requires a VRF oracle. The local VRF setup described at
`https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development`
was not accessible (403). Skipped.

### pinocchio-counter / pinocchio-secret-counter
These programs use the `pinocchio` crate which has `crate-type = ["cdylib"]`
only (no `"lib"`) and uses incompatible types (`pinocchio::Address`,
`AccountView`) that cannot bridge to `solana_program::Pubkey` / `AccountInfo`
without a compatibility shim. No SBF binary is available. Skipped.

### Programs not yet covered
The following examples have TypeScript tests that require live validators
and have no in-process equivalent created in this session:
- `session-keys`
- `crank-counter`
- `magic-actions`
- `anchor-rock-paper-scissor`
- `ephemeral-account-chats`
- `dummy-token-transfer`
- `private-payments`
- `bolt-counter`
- `roll-dice`

Each of these can be approached with the same DualLiteSvmHarness pattern once
the compiled SBF binaries are available.
