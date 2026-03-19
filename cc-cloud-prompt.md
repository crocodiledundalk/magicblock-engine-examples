# Claude Code Cloud Prompt: Run anchor-counter E2E Tests

Use this as a prompt for a Claude Code Cloud instance against the `magicblock-engine-examples` repo.

---

## Prompt

You are working in the `magicblock-engine-examples` repo. Your goal is to set up the full local MagicBlock Ephemeral Rollups development stack and run the E2E tests for the `anchor-counter` example. This involves running two local validators (a Solana test validator and a MagicBlock ephemeral validator) and executing the TypeScript test suite against them.

### Step 1: Install Prerequisites

Install the full toolchain in order. Run each step and verify it succeeds before moving on.

```bash
# 1a. Install Rust (if not present)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup install 1.85.0
rustup default 1.85.0

# 1b. Install Solana CLI v2.3.13
sh -c "$(curl -sSfL https://release.anza.xyz/v2.3.13/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# Verify:
solana --version

# 1c. Generate a Solana keypair and configure for localhost
solana-keygen new --no-bip39-passphrase --silent --force --outfile ~/.config/solana/id.json
solana config set --url localhost

# 1d. Install Anchor v0.32.1 via avm
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1
avm use 0.32.1
export PATH="$HOME/.avm/bin:$PATH"
# Verify:
anchor --version

# 1e. Install the MagicBlock Ephemeral Validator (Node.js global package)
npm install -g @magicblock-labs/ephemeral-validator@latest
# Verify:
ephemeral-validator --help

# 1f. Enable corepack for yarn support
corepack enable
```

### Step 2: Start Solana Test Validator

Start the Solana test validator with the required MagicBlock programs cloned from devnet. This is critical — the ephemeral rollups delegation system depends on these on-chain programs being available.

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

# Wait for the validator to be ready
timeout 30 bash -c 'until solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; do sleep 1; done'
echo "Solana test validator is ready on port 8899"
```

If `timeout` is not available, use a loop:
```bash
for i in $(seq 1 30); do
  solana cluster-version --url http://localhost:8899 >/dev/null 2>&1 && break
  sleep 1
done
```

### Step 3: Start Ephemeral Validator

```bash
# Increase resource limits if possible (may need sudo)
# sudo prlimit --pid $$ --nofile=1048576:1048576 2>/dev/null || true
# sudo sysctl fs.inotify.max_user_instances=1280 2>/dev/null || true
# sudo sysctl fs.inotify.max_user_watches=655360 2>/dev/null || true

RUST_LOG=info ephemeral-validator \
  --remotes "http://localhost:8899" \
  --remotes "ws://localhost:8900" \
  -l "127.0.0.1:7799" &

# Wait for ephemeral validator to be ready
timeout 20 bash -c 'until curl -s http://localhost:7799 >/dev/null 2>&1; do sleep 1; done'
echo "Ephemeral validator is ready on port 7799"
```

### Step 4: Build and Deploy the anchor-counter Program

```bash
cd anchor-counter

# Install JS dependencies
yarn install

# Build the Anchor program (compiles the Rust program to BPF)
anchor build

# Airdrop SOL to the deployer wallet
solana airdrop 100 $(solana address) --url http://localhost:8899

# Deploy the program to the local Solana validator
anchor deploy --provider.cluster localnet
```

### Step 5: Run the E2E Tests

```bash
# Set environment variables and run the test suite
EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
PROVIDER_ENDPOINT=http://localhost:8899 \
WS_ENDPOINT=http://localhost:8900 \
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/anchor-counter.ts
```

**Note:** Only run `tests/anchor-counter.ts`, NOT `tests/advanced-magic.ts`. The advanced-magic tests use `ConnectionMagicRouter` which requires devnet/mainnet and will be skipped on localnet anyway.

### What the Tests Verify

The `anchor-counter.ts` test suite exercises the full Ephemeral Rollups lifecycle:

1. **Initialize counter on Solana** — Creates a counter PDA on the base layer
2. **Increment counter on Solana** — Standard Solana transaction to increment
3. **Delegate counter to ER** — Delegates the account to the ephemeral validator (uses localnet validator identity `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`)
4. **Increment counter on ER** — Executes increment on the ephemeral rollup (fast, no fees)
5. **Commit counter state** — Commits ER state back to the base layer
6. **Increment and commit** — Combined operation via CPI
7. **Increment and undelegate** — Final increment + undelegation back to base layer

### Troubleshooting

- If `solana-test-validator` fails to clone accounts, check network connectivity to `https://api.devnet.solana.com`
- If `anchor build` fails with BPF/SBF errors, ensure Solana CLI and Rust are the correct versions
- If delegation fails, check that the ephemeral validator is running and the cloned programs (especially `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) are present
- If tests timeout, increase the mocha timeout (`-t` flag) or check validator logs at `/tmp/`
- Check validator health: `curl http://localhost:8899/health` and `curl http://localhost:7799/health`
- Check validator logs: the validators run in background, use `jobs` or check stdout

### Iterative Development

Once the test environment is running, you can iterate on the program or tests:

```bash
# After changing programs/anchor-counter/src/lib.rs:
anchor build && anchor deploy --provider.cluster localnet

# After changing tests/anchor-counter.ts:
EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/anchor-counter.ts
```

The validators stay running between iterations. You only need to restart them if you change the cloned programs or validator configuration.

### Key Architecture Reference

From the MagicBlock docs (https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development):

- **Base layer** (solana-test-validator): Standard Solana validator on `http://localhost:8899` / `ws://localhost:8900`
- **Ephemeral Rollup** (ephemeral-validator): MagicBlock's ER validator on `http://localhost:7799` / `ws://localhost:7800`
- The ephemeral validator connects to the base layer via `--remotes` flags
- Delegation moves account ownership from base layer to ER for fast execution
- Commit/undelegate moves state back to the base layer
- Localnet validator identity: `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`

### Key Dependencies and Versions

| Tool | Version |
|------|---------|
| Rust | 1.85.0 |
| Solana CLI | 2.3.13 |
| Anchor | 0.32.1 |
| Node.js | 20+ |
| @magicblock-labs/ephemeral-validator | latest |
| @magicblock-labs/ephemeral-rollups-sdk | 0.6.5 |
| @coral-xyz/anchor (JS) | 0.32.1 |
