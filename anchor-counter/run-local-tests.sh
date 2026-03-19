#!/bin/bash
# Script to run anchor-counter E2E tests locally using MagicBlock ephemeral validator
set -e

export PATH="$PATH:/root/.local/share/solana/install/active_release/bin"

DUMPS="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/bin/local-dumps"
EPHEMERAL_BIN="/opt/node22/lib/node_modules/@magicblock-labs/ephemeral-validator/node_modules/@magicblock-labs/ephemeral-validator-linux-x64/bin/ephemeral-validator"
BYPASS_SO="/tmp/bypass_rlimit.so"
LEDGER_DIR="/tmp/anchor-counter-ledger"
STORAGE_DIR="/tmp/anchor-counter-storage"

# Build the LD_PRELOAD bypass for fd limit (ephemeral-validator requires high fd limit)
if [ ! -f "$BYPASS_SO" ]; then
  echo "Building LD_PRELOAD bypass..."
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
fi

# Start Solana test validator with required MagicBlock programs
echo "Starting Solana test validator..."
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

# Wait for Solana validator to be ready
echo "Waiting for Solana validator..."
for i in $(seq 1 30); do
  if solana cluster-version --url http://localhost:8899 &>/dev/null; then
    echo "Solana validator ready"
    break
  fi
  sleep 1
done

# Start MagicBlock ephemeral validator
# NOTE: The ephemeral-validator binary is a TUI app and requires a PTY.
# Use `script` to allocate a PTY when running non-interactively.
echo "Starting MagicBlock ephemeral validator..."
rm -rf "$STORAGE_DIR"
nohup script -q -c "LD_PRELOAD=$BYPASS_SO $EPHEMERAL_BIN --lifecycle ephemeral --remotes localhost -l 127.0.0.1:7799 --storage $STORAGE_DIR --reset" /dev/null \
  > /tmp/ephemeral-validator.log 2>&1 & disown

# Wait for ephemeral validator to be ready
echo "Waiting for ephemeral validator..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:7799/health &>/dev/null; then
    echo "Ephemeral validator ready"
    break
  fi
  sleep 1
done

# Airdrop and deploy
WALLET=$(solana address --url http://localhost:8899)
echo "Airdropping SOL to $WALLET..."
solana airdrop 100 "$WALLET" --url http://localhost:8899

echo "Building anchor-counter..."
anchor build

echo "Deploying anchor-counter..."
solana program deploy target/deploy/anchor_counter.so \
  --url http://localhost:8899 \
  --program-id target/deploy/anchor_counter-keypair.json

# Install JS deps
yarn install

# Run tests
echo "Running E2E tests..."
EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
ANCHOR_PROVIDER_URL="http://localhost:8899" \
ANCHOR_WALLET="$HOME/.config/solana/id.json" \
yarn ts-mocha --colors -p ./tsconfig.json -t 1000000 --exit tests/anchor-counter.ts
