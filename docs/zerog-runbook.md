# 0G Adapters Runbook

Operator guide for the `@civ/zerog` package — 0G Storage and 0G Compute integration.

## Prerequisites

- Node v20+, pnpm 9+
- `.env` at repo root with the keys listed below
- Testnet OG tokens from https://faucet.0g.ai (chain ID 16602)

## `.env` Keys

| Key | Required | Default | Notes |
|---|---|---|---|
| `ZG_PRIVATE_KEY` | yes | — | Wallet private key (never printed by scripts) |
| `ZG_EVM_RPC` | no | `https://evmrpc-testnet.0g.ai` | 0G EVM RPC endpoint |
| `ZG_STORAGE_INDEXER` | no | `https://indexer-storage-testnet-turbo.0g.ai` | Storage indexer URL |
| `ZG_COMPUTE_PROVIDER` | no (required for compute) | — | Provider address; pin after step 2 |
| `ZG_COMPUTE_MODEL` | no | provider default | e.g. `qwen/qwen2.5-omni-7b` |
| `ZG_FUND_DEPOSIT` | no | `3` | OG to deposit when opening ledger (protocol min is 3) |
| `ZG_FUND_TRANSFER` | no | `0.05` | OG to transfer to provider per setup |

## Important: Run Command

All scripts that import the 0G Compute SDK **must** use `--conditions require` because the compute SDK's 0.8.4 ESM bundle is broken. The correct form for every script in this package is:

```bash
pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/<name>.ts
```

## Step-by-Step Setup

### 1. Fund the Wallet

Go to https://faucet.0g.ai and request testnet OG for your wallet address.

- **Storage only:** any small amount works (well under 1 OG).
- **Compute:** the protocol requires a **minimum of 3 OG** to open a Compute ledger (`addLedger`). Keep at least **~3.2 OG** in the wallet to cover the ledger deposit plus gas.

### 2. Verify Storage (no funds needed beyond gas)

```bash
pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/smoke-0g-storage.ts
```

Expected output: a `rootHash` and `txHash` confirming a file was uploaded to 0G Storage.

### 3. Discover Compute Providers (read-only, no funds required)

```bash
pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/smoke-0g-compute.ts
```

With no `ZG_COMPUTE_PROVIDER` set, this lists available providers. Pick one and pin it in `.env`:

```
ZG_COMPUTE_PROVIDER=0xa48f01287233509FD694a22Bf840225062E67836
ZG_COMPUTE_MODEL=qwen/qwen2.5-omni-7b
```

Re-run to confirm a live inference call succeeds.

### 4. Fund and Inspect the Compute Ledger

```bash
pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/setup-0g-compute.ts
```

This script:
1. Loads config from `.env`
2. Prints your wallet address (never the private key)
3. Opens a ledger if none exists (`addLedger` with `ZG_FUND_DEPOSIT`, default 3 OG)
4. Transfers funds to the pinned provider (`ZG_FUND_TRANSFER`, default 0.05 OG)
5. Prints the current ledger state

**Expected-pending-funding:** if the wallet holds less than ~3.2 OG the script will error with a funding gate message. Top up at https://faucet.0g.ai and retry.

### 5. Run the Full Live Proof

```bash
pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/demo-live-tick.ts
```

Runs one full citizen tick: Ada reasons via 0G Compute, the trace is archived on 0G Storage. Output shows decision, reasoning, model/provider info, verification status, and the Storage `rootHash`/`txHash`.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ZG_PRIVATE_KEY is required` | Missing `.env` | Ensure `.env` exists at repo root |
| `ZG_COMPUTE_PROVIDER not set` | Provider not pinned | Run step 3 and add to `.env` |
| `Failed to create 0G Compute ledger` | Wallet balance < 3.2 OG | Top up at https://faucet.0g.ai |
| `transferFund skipped` warning | Non-fatal; provider may need acknowledgement | Usually safe to ignore; retry if inference fails |
| ESM/import errors from compute SDK | Missing `--conditions require` | Always use the full `pnpm ... exec tsx --conditions require` command |

## On-demand ticks (Advance-the-world-now button)

The web button enqueues a `tick_request`; a 60s timer services it with one real
`run-scheduler` tick. Deploy on the VPS:

1. `git pull` in /opt/civilization-0 (carries the scripts + deploy/ units).
2. **Prerequisite — share the lock.** Wrap the existing `civ0-scheduler.service`
   ExecStart so both timers serialize on the same lock. Edit the unit:
   `ExecStart=/usr/bin/flock -n /run/civ0-scheduler.lock <existing run-scheduler command>`
   then `systemctl daemon-reload`.
3. Install the drainer:
   `cp packages/scheduler/deploy/civ0-tick-drainer.{service,timer} /etc/systemd/system/`
   `systemctl daemon-reload && systemctl enable --now civ0-tick-drainer.timer`
4. Verify: `journalctl -u civ0-tick-drainer -f` shows "no pending tick_request"
   each minute; click the button → next cycle runs a tick and `tick.log` shows
   `result=success`.

`flock -n` means a cycle that finds a tick already running skips cleanly and
retries next minute — no double-tick, no double OG spend.
