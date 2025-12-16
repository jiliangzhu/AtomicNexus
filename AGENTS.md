# AtomicNexus — AGENTS.md (v1.0)

## 0. Mission
Build AtomicNexus v1.0 on Arbitrum:
- DEX: Uniswap V3 (WETH/USDC) + SushiSwap V2 (WETH/USDC)
- Max hops: 3 (framework ready, v1.0 uses 2-hop cross-DEX loop)
- Hard rule: NO-SIM-NO-SEND
- Risk rule: net_profit_usd >= 10 after gas + tip

## 1. Non-negotiable Safety & Scope
- No exploit development, no vulnerability abuse, no illegal / abusive tactics.
- Strategy must be simple and deterministic in v1.0.
- Any transaction must pass simulator-gate before sending.

## 2. Repository Boundaries
- contracts/evm: Solidity + Hardhat tests only
- services/*: runtime services (Python/TS)
- libs/*: shared code; no service imports from other services directly
- infra/: only docker/monitoring/migrations

## 3. Quality Bar (Definition of Done)
- All new code includes unit tests and at least one failure-path test.
- Every pipeline item carries trace_id and logs with it.
- Simulator-gate is mandatory and cannot be bypassed.
- Errors use typed error codes; no silent catch.
- CI must pass: lint + typecheck + unit tests + contract tests.

## 4. Tooling
- Python: 3.11, ruff, black, mypy, pytest
- TS/Node: node 20+, pnpm, eslint, vitest
- Solidity: hardhat + solidity-coverage
- DB: Postgres (Timescale optional), Redis for hot state

## 5. Commands
- bootstrap: `docker compose up -d`
- run ingestion: `pnpm --filter ingestion dev`
- run strategy: `pnpm --filter strategy dev`
- run execution: `pnpm --filter execution dev`
- run api: `pnpm --filter api dev`
- test all: `pnpm test`
- contract test: `pnpm --filter contracts test`

## 6. Architecture Rules
- Off-chain computes route + size + constraints.
- On-chain only executes steps and verifies repayment/profit receiver.
- Always store:
  - candidate (raw)
  - plan (optimized)
  - sim_result (pass/fail + reason)
  - send_result (tx hash)
  - receipt + final pnl

## 7. Error Codes (examples)
- SIM_REVERT
- SIM_SLIPPAGE
- SIM_INSUFFICIENT_LIQ
- RISK_BELOW_MIN_PROFIT
- RISK_FAIL_STREAK_FUSE
- SEND_EXPIRED_TTL
