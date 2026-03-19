# SKILLS: Running anchor-counter E2E Tests Locally

This document describes precisely how to run the `anchor-counter` end-to-end test suite
against local validators. It is based on hard-won experience; every gotcha is documented.

---

## Architecture Overview

Tests require **two validators running in parallel**:

| Validator | Binary | HTTP | WebSocket | Purpose |
|-----------|--------|------|-----------|---------|
| Solana test validator | `solana-test-validator` | `localhost:8899` | `localhost:8900` | Base layer (L1) |
| MagicBlock ephemeral validator | `ephemeral-validator` | `localhost:7799` | `localhost:7800` | Ephemeral rollup (L2) |

The ephemeral validator connects to the base layer via `--remotes` flags. The two must
be started in order: base layer first, then ephemeral.

---

## Required Tool Versions

| Tool | Version | Install method |
|------|---------|----------------|
| Rust | 1.85.0 | rustup |
| Solana CLI | 2.3.13 | anza.xyz installer |
| Anchor | 0.32.1 | avm |
| Node.js | 20+ | system / nvm |
| yarn | 1.22.x | corepack |
| `@magicblock-labs/ephemeral-validator` | latest | npm global |

**Version mismatches will silently produce wrong results or cryptic errors.**

---

## Step 1: Install Prerequisites

```bash
# Rust (if not present)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup install 1.85.0
rustup default 1.85.0

# Solana CLI v2.3.13
sh -c "$(curl -sSfL https://release.anza.xyz/v2.3.13/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version   # must print: solana-cli 2.3.13

# Solana keypair and config
solana-keygen new --no-bip39-passphrase --silent --force --outfile ~/.config/solana/id.json
solana config set --url localhost

# Anchor v0.32.1 via avm
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1
avm use 0.32.1
export PATH="$HOME/.avm/bin:$PATH"
anchor --version   # must print: anchor-cli 0.32.1

# MagicBlock ephemeral validator (Node.js global package)
npm install -g @magicblock-labs/ephemeral-validator@latest
ephemeral-validator --help   # must succeed

# Enable corepack so yarn works
corepack enable
```

---

## Step 2: Start Solana Test Validator

The base-layer validator must load specific MagicBlock programs. There are two ways.

### Option A — Clone from devnet (requires internet access)

```bash
solana-test-validator \
  --ledger ./my-ledger \
  --reset \
  --clone mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev \
  --clone EpJnX7ueXk7fKojBymqmVuCuwyhDQsYcLVL1XMsBbvDX \
  --clone 7JrkjmZPprHwtuvtuGTXp9hwfGYFAQLnLeFM52kqAgXg \
  --clone noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV \
  --clone-upgradeable-program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh \
  --clone Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh \
  --clone 5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc \
  --clone F72HqCR8nwYsVyeVd38pgKkjXmXFzVAM8rjZZsXWbdE \
  --clone vrfkfM4uoisXZQPrFiS2brY4oMkU9EWjyvmvqaFd5AS \
  --clone-upgradeable-program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz \
  --clone-upgradeable-program BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi \
  --url https://api.devnet.solana.com &
```

### Option B — Load from local `.so` / `.json` dumps (offline, faster)

The `ephemeral-validator` npm package ships pre-built program dumps at:

```
/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/bin/local-dumps/
```

(Adjust the prefix if Node.js is installed elsewhere — e.g. `/usr/local/lib/node_modules/...`)

```bash
DUMPS="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/bin/local-dumps"
LEDGER_DIR="/tmp/anchor-counter-ledger"
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
```

### Wait for readiness

```bash
for i in $(seq 1 30); do
  solana cluster-version --url http://localhost:8899 &>/dev/null && echo "Solana validator ready" && break
  sleep 1
done
# Verify:
curl http://localhost:8899/health   # must return: ok
```

---

## Step 3: Start MagicBlock Ephemeral Validator

**This step has the most gotchas — read carefully.**

### GOTCHA 1: ephemeral-validator is a TUI app and requires a PTY

The `ephemeral-validator` binary uses a terminal UI (TUI) framework. When run in a
non-interactive shell (background, CI, `nohup`), it fails silently or hangs because there
is no TTY attached. The fix is to use the `script` command to allocate a pseudo-terminal:

```bash
script -q -c "COMMAND" /dev/null
```

`/dev/null` discards the `typescript` session file that `script` normally writes.

### GOTCHA 2: ephemeral-validator requires 1,048,576 open file descriptors

The validator checks `RLIMIT_NOFILE` on startup and aborts if the soft limit is below
1,048,576. In most environments the limit is 1,024 or 65,536.

**If you have sudo (CI, bare metal):**

```bash
sudo prlimit --pid $$ --nofile=1048576:1048576
sudo sysctl fs.inotify.max_user_instances=1280
sudo sysctl fs.inotify.max_user_watches=655360
```

**If you do NOT have sudo (rootless containers, Claude Code Cloud):**

Build and use an `LD_PRELOAD` shim that lies to the binary about the fd limit:

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

### GOTCHA 3: ephemeral-validator binary path is nested inside the npm package

The `ephemeral-validator` npm package wraps a platform-specific native binary. The
actual executable is not the npm wrapper but a nested binary:

```
/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/
  node_modules/@magicblock-labs/ephemeral-validator-linux-x64/
    bin/ephemeral-validator
```

Adjust the Node.js prefix path if your global packages live elsewhere (check with
`npm root -g`).

### Starting the ephemeral validator (combining all fixes)

```bash
BYPASS_SO="/tmp/bypass_rlimit.so"
EPHEMERAL_BIN="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/node_modules/@magicblock-labs/ephemeral-validator-linux-x64/bin/ephemeral-validator"
STORAGE_DIR="/tmp/anchor-counter-storage"
rm -rf "$STORAGE_DIR"

nohup script -q -c \
  "LD_PRELOAD=$BYPASS_SO $EPHEMERAL_BIN --lifecycle ephemeral --remotes localhost -l 127.0.0.1:7799 --storage $STORAGE_DIR --reset" \
  /dev/null \
  > /tmp/ephemeral-validator.log 2>&1 & disown
```

**If you have sudo**, skip `LD_PRELOAD` and use the npm wrapper directly:

```bash
RUST_LOG=info ephemeral-validator \
  --remotes "http://localhost:8899" \
  --remotes "ws://localhost:8900" \
  -l "127.0.0.1:7799" &
```

### Wait for readiness

```bash
for i in $(seq 1 15); do
  curl -sf http://localhost:7799/health &>/dev/null && echo "Ephemeral validator ready" && break
  sleep 1
done
# Verify:
curl http://localhost:7799/health   # must return: ok
```

---

## Step 4: Build and Deploy the anchor-counter Program

```bash
cd anchor-counter

# Fund the deployer wallet
solana airdrop 100 $(solana address) --url http://localhost:8899

# Build the Rust program to BPF bytecode
anchor build

# Deploy to the local Solana validator
solana program deploy target/deploy/anchor_counter.so \
  --url http://localhost:8899 \
  --program-id target/deploy/anchor_counter-keypair.json

# Install JS/TS dependencies
yarn install
```

### GOTCHA 4: `anchor deploy` vs `solana program deploy`

`anchor deploy --provider.cluster localnet` reads the program ID from `Anchor.toml` and
the keypair from `target/deploy/anchor_counter-keypair.json`. If the keypair file doesn't
exist yet (first build), this works fine. If you previously deployed to a different
address, re-deploying to the same keypair address requires the upgrade authority to match
your wallet. When in doubt, use `solana program deploy` directly with explicit paths as
shown above.

### GOTCHA 5: `anchor build` uses the wrong Solana version

`anchor build` shells out to `cargo build-sbf`. If `solana-cli` is not on `PATH` or
the wrong version is active, the build fails with BPF toolchain errors. Always verify:

```bash
which solana        # must be under ~/.local/share/solana/install/active_release/bin/
solana --version    # must be 2.3.13
```

---

## Step 5: Run the Tests

```bash
cd anchor-counter   # if not already there

EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
ANCHOR_PROVIDER_URL="http://localhost:8899" \
ANCHOR_WALLET="$HOME/.config/solana/id.json" \
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/anchor-counter.ts
```

### GOTCHA 6: Do NOT run `tests/advanced-magic.ts`

`advanced-magic.ts` uses `ConnectionMagicRouter` which requires devnet or mainnet. It
auto-skips when `rpcEndpoint` contains `localhost`, but running it still wastes time and
can produce confusing partial output. Run only `tests/anchor-counter.ts`.

### GOTCHA 7: Do NOT use `anchor test` without `--skip-local-validator --skip-deploy`

Running plain `anchor test` will try to spin up its own validator, which will conflict
with the one already running on port 8899. The correct CI incantation is:

```bash
anchor test \
  --provider.cluster localnet \
  --skip-local-validator \
  --skip-deploy
```

Or skip `anchor test` entirely and run `yarn ts-mocha` directly as shown above — that's
simpler and more explicit.

---

## What the 7 Tests Verify

All tests are in `anchor-counter/tests/anchor-counter.ts`:

| # | Test name | Description |
|---|-----------|-------------|
| 1 | Initialize counter on Solana | Creates a counter PDA on the base layer |
| 2 | Increase counter on Solana | Standard Solana transaction increment |
| 3 | Delegate counter to ER | Transfers account ownership to the ephemeral rollup; uses the localnet validator identity `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` |
| 4 | Increase counter on ER | Executes increment on the ephemeral rollup (fast, no fees) |
| 5 | Commit counter state on ER to Solana | Commits ER state back to base layer |
| 6 | Increase counter on ER and commit | Atomic increment + commit via CPI |
| 7 | Increment and undelegate counter on ER to Solana | Atomic increment + undelegation back to base layer |

---

## Fastest End-to-End: Use the Provided Script

`anchor-counter/run-local-tests.sh` does everything above automatically (Option B /
no-sudo path). Run it from the repo root:

```bash
cd /path/to/magicblock-engine-examples
bash anchor-counter/run-local-tests.sh
```

It handles: building the LD_PRELOAD shim, starting both validators, waiting for
readiness, airdropping, building, deploying, installing deps, and running the tests.

---

## Debugging

### Validator logs

```bash
tail -f /tmp/solana-validator.log       # Solana base-layer validator
tail -f /tmp/ephemeral-validator.log    # MagicBlock ephemeral validator
```

### Health checks

```bash
curl http://localhost:8899/health   # must return: ok
curl http://localhost:7799/health   # must return: ok
```

### Is a validator already running?

```bash
solana cluster-version --url http://localhost:8899
curl -s http://localhost:7799/health
```

### Kill all validators

```bash
pkill -f solana-test-validator || true
pkill -f ephemeral-validator   || true
```

---

## Common Errors and Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: Connection refused (localhost:8899)` | Solana validator not yet ready | Wait longer; check `/tmp/solana-validator.log` |
| `Error: Connection refused (localhost:7799)` | Ephemeral validator not yet ready or crashed | Check `/tmp/ephemeral-validator.log`; verify PTY fix applied |
| `ephemeral-validator` exits immediately with no output | TUI requires PTY | Wrap with `script -q -c "..." /dev/null` |
| `ephemeral-validator` crashes with fd-limit error | RLIMIT_NOFILE too low | Use `LD_PRELOAD` bypass or `sudo prlimit` |
| `anchor build` fails with BPF toolchain error | Wrong Solana CLI version | Ensure `solana --version` is 2.3.13 and it's on PATH |
| Delegation test fails: `account not found` | Required MagicBlock programs not loaded into Solana validator | Restart Solana validator with all `--clone` / `--bpf-program` flags |
| Test 3 (delegate) fails with `InvalidValidator` | `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` account not loaded | Ensure the `--account` for that address is passed to `solana-test-validator` |
| `Error: Account does not exist` during airdrop | Solana validator not fully synced yet | Wait 2–3 more seconds and retry |
| `yarn: command not found` | corepack not enabled | Run `corepack enable` |
| `ts-mocha: command not found` | JS deps not installed | Run `yarn install` in `anchor-counter/` |
| Tests pass but count values are wrong | Stale ledger from previous run | Delete ledger dir (`rm -rf /tmp/anchor-counter-ledger`) and restart |
| `anchor deploy` fails: `Error: Deploying program failed` | Insufficient SOL in wallet | Run `solana airdrop 100 $(solana address) --url http://localhost:8899` |
| Port already in use on 8899 / 7799 | Previous validator still running | `pkill -f solana-test-validator; pkill -f ephemeral-validator` |
| `script: command not found` | `util-linux` or `bsdutils` not installed | Install via `apt-get install bsdutils` or use `expect` / `unbuffer` as an alternative PTY allocator |

---

## Iterative Development

The validators stay running between test runs. You only need to restart them if you
modify the cloned programs or validator configuration.

After changing the Rust program (`programs/anchor-counter/src/lib.rs`):

```bash
cd anchor-counter
anchor build
solana program deploy target/deploy/anchor_counter.so \
  --url http://localhost:8899 \
  --program-id target/deploy/anchor_counter-keypair.json
```

After changing only the TypeScript tests:

```bash
cd anchor-counter
EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
ANCHOR_PROVIDER_URL="http://localhost:8899" \
ANCHOR_WALLET="$HOME/.config/solana/id.json" \
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/anchor-counter.ts
```
