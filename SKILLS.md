# SKILLS: Running MagicBlock Engine Example Tests Locally

This document describes how to run the example test suites against local validators.
Every gotcha is documented based on direct testing of this environment.

---

## Architecture Overview

Tests require **two validators running in parallel**:

| Validator | Binary | HTTP | WebSocket | Purpose |
|-----------|--------|------|-----------|---------|
| Solana test validator | `solana-test-validator` | `localhost:8899` | `localhost:8900` | Base layer (L1) |
| MagicBlock ephemeral validator | `ephemeral-validator` | `localhost:7799` | `localhost:7800` | Ephemeral rollup (L2) |

The ephemeral validator connects to the base layer via `--remotes` flags. Start base layer first, then ephemeral.

---

## Test Suite Status by Example

| Example | Test type | Result | Notes |
|---------|-----------|--------|-------|
| `anchor-counter` | Mocha (ts-mocha) | **7/7 pass** | Full E2E including delegate/commit/undelegate |
| `rust-counter` | Vitest | **7/7 pass** | Requires `cargo build-sbf` + `solana program deploy` |
| `oncurve-delegation` | Vitest | **3/3 pass** | Requires pre-funded dedicated keypairs in `.env` |
| `spl-tokens` | Mocha (ts-mocha) | **1/2 pass** | Second test fails: ER cloner Custom(9) on re-delegated token accounts |
| `anchor-rock-paper-scissor` | Mocha (ts-mocha) | **3/10 pass** | 7 tests require TEE endpoint (`tee.magicblock.app`) |
| `session-keys` | Mocha (ts-mocha) | **1/10 pass** (Initialize only) | Needs `gpl_session` program (`KeyspM2...`) not available locally |
| `anchor-minter` | Mocha (ts-mocha) | **0/2 pass** | Needs Metaplex Token Metadata (`metaqbxx...`) not available locally |

---

## Required Tool Versions

| Tool | Version | Install method |
|------|---------|----------------|
| Rust | 1.85.0 | rustup |
| Solana CLI | 2.3.13 | anza.xyz installer |
| Anchor | 0.32.1 | avm (installed at `~/.avm/versions/0.32.1/anchor`) |
| Node.js | 20+ | system / nvm |
| yarn | 1.22.x | corepack |
| `@magicblock-labs/ephemeral-validator` | latest | npm global |

**Version mismatches will silently produce wrong results or cryptic errors.**

---

## Step 1: Start Solana Test Validator

The base-layer validator must load specific MagicBlock programs from the local dumps shipped
with the `ephemeral-validator` npm package.

```bash
export PATH="$PATH:/root/.local/share/solana/install/active_release/bin"
DUMPS="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/bin/local-dumps"
LEDGER_DIR="/tmp/mb-ledger"
rm -rf "$LEDGER_DIR"

nohup solana-test-validator \
  --ledger "$LEDGER_DIR" --reset \
  --bpf-program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh "$DUMPS/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh.so" \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV "$DUMPS/noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV.so" \
  --bpf-program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz "$DUMPS/Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz.so" \
  --bpf-program ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1 "$DUMPS/ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1.so" \
  --bpf-program SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2 "$DUMPS/SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2.so" \
  --bpf-program EnhkomtzKms55jXi3ijn9XsMKYpMT4BJjmbuDQmPo3YS "$DUMPS/EnhkomtzKms55jXi3ijn9XsMKYpMT4BJjmbuDQmPo3YS.so" \
  --bpf-program DmnRGfyyftzacFb1XadYhWF6vWqXwtQk5tbr6XgR3BA1 "$DUMPS/DmnRGfyyftzacFb1XadYhWF6vWqXwtQk5tbr6XgR3BA1.so" \
  --account mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev "$DUMPS/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev.json" \
  --account EpJnX7ueXk7fKojBymqmVuCuwyhDQsYcLVL1XMsBbvDX "$DUMPS/EpJnX7ueXk7fKojBymqmVuCuwyhDQsYcLVL1XMsBbvDX.json" \
  --account 7JrkjmZPprHwtuvtuGTXp9hwfGYFAQLnLeFM52kqAgXg "$DUMPS/7JrkjmZPprHwtuvtuGTXp9hwfGYFAQLnLeFM52kqAgXg.json" \
  --account Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh "$DUMPS/Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh.json" \
  --account 5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc "$DUMPS/5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc.json" \
  --account F72HqCR8nwYsVyeVd38pgKkjXmXFzVAM8rjZZsXWbdE "$DUMPS/F72HqCR8nwYsVyeVd38pgKkjXmXFzVAM8rjZZsXWbdE.json" \
  > /tmp/solana-validator.log 2>&1 & disown

# Wait for readiness
for i in $(seq 1 30); do
  solana cluster-version --url http://localhost:8899 &>/dev/null && echo "Solana validator ready" && break
  sleep 1
done
```

---

## Step 2: Start MagicBlock Ephemeral Validator

**This step has the most gotchas — read carefully.**

### GOTCHA 1: ephemeral-validator is a TUI app and requires a PTY

The binary uses a terminal UI framework. In non-interactive shells it fails silently.
Wrap with `script` to allocate a pseudo-terminal:

```bash
script -q -c "COMMAND" /dev/null
```

### GOTCHA 2: ephemeral-validator requires 1,048,576 open file descriptors

Without root, build and use an `LD_PRELOAD` shim that lies about the fd limit:

```bash
BYPASS_SO="/tmp/bypass_rlimit.so"
cat > /tmp/bypass_rlimit.c << 'EOF'
#define _GNU_SOURCE
#include <sys/resource.h>
#include <dlfcn.h>
#include <errno.h>

int getrlimit(__rlimit_resource_t resource, struct rlimit *rlim) {
    typedef int (*fn_t)(__rlimit_resource_t, struct rlimit *);
    fn_t orig = (fn_t)dlsym(RTLD_NEXT, "getrlimit");
    int ret = orig(resource, rlim);
    if (resource == RLIMIT_NOFILE) {
        rlim->rlim_cur = 1048576;
        rlim->rlim_max = 1048576;
        return 0;
    }
    return ret;
}

int setrlimit(__rlimit_resource_t resource, const struct rlimit *rlim) {
    typedef int (*fn_t)(__rlimit_resource_t, const struct rlimit *);
    fn_t orig = (fn_t)dlsym(RTLD_NEXT, "setrlimit");
    int ret = orig(resource, rlim);
    if (ret != 0 && resource == RLIMIT_NOFILE) {
        errno = 0;
        return 0;
    }
    return ret;
}
EOF
gcc -shared -fPIC -o "$BYPASS_SO" /tmp/bypass_rlimit.c -ldl
```

### GOTCHA 3: actual binary is nested inside the npm package

```
/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/
  node_modules/@magicblock-labs/ephemeral-validator-linux-x64/
    bin/ephemeral-validator
```

### Start the ephemeral validator (all fixes combined)

```bash
BYPASS_SO="/tmp/bypass_rlimit.so"
EPHEMERAL_BIN="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/node_modules/@magicblock-labs/ephemeral-validator-linux-x64/bin/ephemeral-validator"
STORAGE_DIR="/tmp/mb-storage"
rm -rf "$STORAGE_DIR"

nohup script -q -c \
  "LD_PRELOAD=$BYPASS_SO $EPHEMERAL_BIN --lifecycle ephemeral --remotes localhost -l 127.0.0.1:7799 --storage $STORAGE_DIR --reset" \
  /dev/null > /tmp/ephemeral-validator.log 2>&1 & disown

for i in $(seq 1 20); do
  curl -sf http://localhost:7799/health &>/dev/null && echo "Ephemeral validator ready" && break
  sleep 1
done
```

---

## Step 3: Airdrop SOL

```bash
solana airdrop 1000 $(solana address) --url http://localhost:8899
```

---

## Step 4: Build and Deploy Your Program

### Anchor programs

```bash
export PATH="/root/.avm/versions/0.32.1:$PATH"  # add anchor to PATH directly; avm shim needs version file
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export ANCHOR_PROVIDER_URL="http://127.0.0.1:8899"

cd <example-dir>
anchor build
anchor deploy --provider.cluster localnet
yarn install
```

### GOTCHA 4: avm shim requires a version file

The `avm` shim at `~/.avm/bin/anchor` reads `~/.avm/version` to know which anchor to
use. If the file is missing, it errors: `Error: Anchor version not set. Please run avm use latest`.
In offline environments `avm use` fails because it can't reach GitHub.

**Fix**: Add the installed version's directory directly to PATH, bypassing the shim:

```bash
export PATH="/root/.avm/versions/0.32.1:$PATH"
anchor --version   # now works
```

### GOTCHA 5: declare_id! / Anchor.toml / keypair mismatch

Anchor programs have three places that must agree on the program ID:
1. `declare_id!("...")` in `programs/<name>/src/lib.rs`
2. `[programs.localnet]` in `Anchor.toml`
3. The keypair at `target/deploy/<name>-keypair.json` (generated by `anchor build`)

If a project was developed on devnet with a different keypair, these will mismatch and
deployment fails with `DeclaredProgramIdMismatch`.

**Fix**: Sync all three to the keypair address:

```bash
# Get the address the keypair will deploy to
PROG_ID=$(solana address --keypair target/deploy/<name>-keypair.json)

# Update declare_id! in lib.rs
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROG_ID\")/" programs/<name>/src/lib.rs

# Update Anchor.toml
sed -i "s/<old-id>/$PROG_ID/g" Anchor.toml

# Rebuild
anchor build
```

### Non-anchor (Rust) programs

```bash
cd <example-dir>
cargo build-sbf
solana program deploy --program-id target/deploy/<name>-keypair.json \
  target/deploy/<name>.so --url http://localhost:8899
```

---

## Step 5: Run the Tests

### Anchor examples using fullstack-test.sh

The `fullstack-test.sh` script auto-detects running validators and re-uses them:

```bash
export PATH="/root/.avm/versions/0.32.1:$PATH:/root/.local/share/solana/install/active_release/bin"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
export ANCHOR_PROVIDER_URL="http://127.0.0.1:8899"
export EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799"
export EPHEMERAL_WS_ENDPOINT="ws://localhost:7800"

cd <example-dir>
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/**/*.ts \
  --provider.cluster localnet --skip-local-validator --skip-build --skip-deploy
```

### Vitest examples (rust-counter, oncurve-delegation, pinocchio-*)

```bash
export PROVIDER_ENDPOINT="http://127.0.0.1:8899"
export WS_ENDPOINT="ws://127.0.0.1:8900"
export EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799"
export EPHEMERAL_WS_ENDPOINT="ws://localhost:7800"
export PRIVATE_KEY="$(cat ~/.config/solana/id.json)"

cd <example-dir>
yarn install
yarn test
```

---

## Example-Specific Gotchas

### GOTCHA 6: oncurve-delegation — delegating the main fee-payer wallet poisons state

The oncurve-delegation test delegates an "on-curve" (wallet) account to the ER. If you
set `PRIVATE_KEY` to your main deployer wallet, that wallet gets owned by the delegation
program and can no longer pay transaction fees.

**Fix**: Generate a dedicated keypair, pre-fund it, and write it to the example's `.env`:

```bash
solana-keygen new --no-bip39-passphrase -o /tmp/oncurve-user.json
solana airdrop 10 $(solana address --keypair /tmp/oncurve-user.json) --url http://localhost:8899

solana-keygen new --no-bip39-passphrase -o /tmp/oncurve-feepayer.json
solana airdrop 10 $(solana address --keypair /tmp/oncurve-feepayer.json) --url http://localhost:8899

echo "PRIVATE_KEY=$(cat /tmp/oncurve-user.json)" > oncurve-delegation/.env
echo "FEE_PAYER_PRIVATE_KEY=$(cat /tmp/oncurve-feepayer.json)" >> oncurve-delegation/.env
```

### GOTCHA 7: oncurve-delegation — .env file must exist before running

The `initializeFeePayer` function reads `.env` to append `FEE_PAYER_PRIVATE_KEY` to it.
If the file does not exist, it throws `ENOENT`. Ensure `.env` exists (even if empty)
before running tests. (Fixed in `tests/kit/initializeKeypair.ts` to use `fs.existsSync`.)

### GOTCHA 8: oncurve-delegation — fee payer timing issue with self-funded airdrop

When `PRIVATE_KEY` is not set, the test generates a keypair and airdrops via the kit's
`airdropFactory`. The `initializeFeePayer` balance check may race the airdrop confirmation
and see 0, causing the fee payer to remain unfunded. The delegation transaction then times
out after 10–12 seconds.

**Fix**: Always pre-fund both user and fee payer with the Solana CLI (see GOTCHA 6 above).

### GOTCHA 9: spl-tokens — re-delegating token accounts after undelegation fails

The ER's cloner errors with `Custom(9)` (`UninitializedState`) when trying to clone a
token account that was previously delegated and then undelegated in the same test session.
The second test in `spl-tokens` re-uses the same token accounts as the first. The first
test passes; the second fails.

### GOTCHA 10: advanced-magic / router tests require devnet router

Any test file that imports `ConnectionMagicRouter` or uses `ROUTER_ENDPOINT` needs to
reach `devnet-router.magicblock.app`. These tests cannot run on localnet.

**Affected**: `anchor-counter/tests/advanced-magic.ts`, `rust-counter/tests/kit/advanced-magic.test.ts`

**Fix for rust-counter**: The `test` script was updated to run only `rust-counter.test.ts`:

```json
"test": "npx vitest run ./tests/kit/rust-counter.test.ts",
"test-advanced": "npx vitest run ./tests/kit"
```

### GOTCHA 11: session-keys requires gpl_session program

`session-keys` depends on `@magicblock-labs/gum-sdk` which calls the `gpl_session`
program at `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`. This program is not included
in the local validator dumps and must be cloned from devnet or mainnet.

### GOTCHA 12: anchor-minter requires Metaplex Token Metadata program

`anchor-minter` creates NFTs via Metaplex. It needs the Token Metadata program at
`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`. This must be cloned from devnet/mainnet.

### GOTCHA 13: anchor-rock-paper-scissor requires TEE endpoint

Tests that call `providerTeePlayer1 / providerTeePlayer2` only initialize when the
ephemeral RPC URL contains `"tee"`. On localnet (url = `http://localhost:7799`), those
providers remain `undefined` and tests throw `TypeError: Cannot read properties of undefined`.
These tests require `https://tee.magicblock.app`.

---

## Common Errors and Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: Connection refused (localhost:8899)` | Solana validator not ready | Wait; check `/tmp/solana-validator.log` |
| `Error: Connection refused (localhost:7799)` | Ephemeral validator crashed | Check `/tmp/ephemeral-validator.log`; verify PTY + LD_PRELOAD |
| `ephemeral-validator` exits immediately | TUI requires PTY | Wrap with `script -q -c "..." /dev/null` |
| `ephemeral-validator` crashes: fd-limit | RLIMIT_NOFILE too low | Use `LD_PRELOAD` bypass shim |
| `Error: Anchor version not set` | avm shim can't read version file | Add `~/.avm/versions/0.32.1` directly to PATH |
| `DeclaredProgramIdMismatch` on deploy | declare_id / Anchor.toml / keypair mismatch | Sync all three to the keypair address (GOTCHA 5) |
| `This account may not be used to pay transaction fees` | Wallet was previously delegated to ER and is now owned by delegation program | Restart validators with fresh ledger; use a new wallet |
| `TransactionExpiredBlockheightExceededError` during `Create session` | gpl_session program not deployed; tx sent but never landed | Clone gpl_session from devnet first |
| `Cloner error: Custom(9) UninitializedState` on ER | Re-delegating already-undelegated token accounts | Use fresh accounts per test, or restart validators |
| `TypeError: Cannot read properties of undefined (reading 'connection')` | TEE providers undefined on localnet | These tests require `tee.magicblock.app` endpoint |
| `InvalidProgramExecutable` for token_metadata_program | Metaplex not deployed | Clone metaqbxx... from devnet/mainnet |
| `TransactionExpiredBlockheightExceededError` in fee-payer setup | Fee payer has 0 SOL; tx dropped silently | Pre-fund fee payer with CLI airdrop (GOTCHA 8) |
| `ENOENT: no such file or directory, open '.env'` in oncurve-delegation | initializeFeePair reads `.env` before it exists | Create empty `.env` first, or use GOTCHA 6 approach |
| Delegation test fails: `InvalidValidator` | `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` account not loaded | Ensure `--account` for that address is passed to `solana-test-validator` |
| `yarn: command not found` | corepack not enabled | Run `corepack enable` |
| `anchor build` fails with BPF toolchain error | Wrong Solana CLI on PATH | Ensure `solana --version` is 2.3.13 |

---

## Health Checks

```bash
curl http://localhost:8899/health   # must return: ok
curl http://localhost:7799/health   # must return (JSON error is fine): any response
solana cluster-version --url http://localhost:8899
```

## Kill All Validators

```bash
kill $(lsof -ti :8899) 2>/dev/null
kill $(lsof -ti :7799) 2>/dev/null
```

---

## Iterative Development

Validators stay running between test runs. Only restart if you need a clean ledger state.

After changing Rust program source:
```bash
anchor build && anchor deploy --provider.cluster localnet
```

After changing TypeScript tests only — just re-run the test command directly.
