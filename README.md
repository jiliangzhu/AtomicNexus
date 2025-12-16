# AtomicNexus (v1.0)

AtomicNexus v1.0 is an **off-chain brain + on-chain executor** system for deterministic, observable, and simulation-gated on-chain arbitrage on **Arbitrum One**.

> **v1.0 scope**
>
> - Chain: **Arbitrum One**
> - DEX: **Uniswap V3 (WETH/USDC)**, **SushiSwap V2 (WETH/USDC)**
> - Max hops: **3** (framework-ready; v1.0 opportunity set is effectively 2-hop)
> - Hard rule: **NO-SIM-NO-SEND**
> - Risk rule: **net_profit_usd ≥ $10** after estimated gas + tip

---

## Quickstart

### Prerequisites
- Node.js 20+
- pnpm
- Docker + Docker Compose
- An Arbitrum RPC:
  - WS URL for subscriptions
  - HTTP URL for reads/simulation

### 1) Bootstrap infra
```bash
cd AtomicNexus
docker compose up -d
```

### 2) Configure env
Create `.env` at repo root (example):
```bash
# RPC
ARB_WS_RPC_URL=wss://YOUR_ARB_WS
ARB_HTTP_RPC_URL=https://YOUR_ARB_HTTP

# Target pools (v1.0)
UNI_V3_POOL_ADDR=0x...
SUSHI_V2_PAIR_ADDR=0x...

# Risk
MIN_NET_PROFIT_USD=10
MAX_HOPS=3
TTL_BLOCKS=3
FAIL_STREAK_FUSE=5

# Storage
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/atomicnexus
REDIS_URL=redis://localhost:6379

# Optional: sender private key for dev only (do NOT use prod funds)
SENDER_PRIVATE_KEY=0x...
```

### 3) Install deps
```bash
pnpm install
```

### 4) Run services (dev)
In separate terminals:
```bash
pnpm --filter ingestion dev
pnpm --filter strategy dev
pnpm --filter execution dev
pnpm --filter api dev
```

### 5) Open Swagger UI
- http://localhost:8080 (depends on api service implementation)

---

## Repo Layout

```
contracts/evm      # Solidity executor + adapters + tests
services/ingestion # WS subscriptions, event decode, pool state cache
services/strategy  # find -> optimize -> risk
services/execution # tx-build -> simulate gate -> send
services/api       # Swagger ops API
libs/*             # shared libs: common/evm/math
infra/             # docker compose, migrations, monitoring
docs/              # whitepaper + architecture + runbooks
```

---

## Core Pipeline

1. **Ingestion** subscribes to chain events and maintains `PoolState` (Redis + DB).
2. **Opportunity finder** detects UniV3 vs SushiV2 price discrepancies.
3. **Optimizer** computes best size `x*` using deterministic numeric search + swap simulation.
4. **Risk engine** enforces `net_profit_usd ≥ 10` and fuse/blacklist rules.
5. **Tx builder** encodes `plan_bytes` for `AtomicNexusExecutor.execute(plan_bytes)`.
6. **Simulator gate** (mandatory) runs fork `eth_call`—if it fails, nothing is sent.
7. **Sender** submits tx (v1.0 can use normal RPC as placeholder; private relay is pluggable).
8. **Analyzer** computes realized PnL and writes attribution.

---

## Development Workflow (Codex-friendly)

- Read **AGENTS.md** before making changes.
- Keep PRs small and single-purpose (one service/module per PR).
- For every PR:
  - add tests (happy + failure path)
  - include typed error codes (no silent catch)
  - attach `trace_id` to all logs
  - ensure CI passes

---

## Testing

Run all:
```bash
pnpm test
```

Contracts:
```bash
pnpm --filter contracts test
```

---

## Security Notes

- **Do not** use real keys in dev. For production, isolate signer/keys and use a hardened setup.
- The system enforces **NO-SIM-NO-SEND**. Do not bypass simulation.
- Start with **small amounts** and strict thresholds; tune after observing failure modes.

---

## Docs
- `docs/architecture.md` — system architecture and data model
- `docs/whitepaper.md` — research + system blueprint (whitepaper)
- `docs/runbook.md` — operational runbook (to be added)
