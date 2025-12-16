# AtomicNexus v1.0 — architecture.md

> **Scope (frozen for v1.0)**
>
> - **Chain**: Arbitrum One  
> - **DEX**: Uniswap V3 (WETH/USDC), SushiSwap V2 (WETH/USDC)  
> - **Max hops**: 3 (framework-ready; v1.0 opportunity set is effectively 2-hop loop across two venues)  
> - **Hard rule**: **NO-SIM-NO-SEND** (simulation gate is mandatory)  
> - **Risk rule**: **net_profit_usd ≥ 10** after estimated gas + tip

---

## 1. Architecture Goals

AtomicNexus v1.0 is designed to be:

1. **Off-chain decision, on-chain execution**  
   All heavy computation (pricing, optimization, risk) is off-chain. On-chain contract is a minimal atomic executor.

2. **Deterministic & testable**  
   Every opportunity is traced end-to-end using `trace_id`. All decisions are reproducible via event/state replay.

3. **Observable by default**  
   Structured logs, metrics, and a queryable trace store exist from day one.

4. **Composable & extensible**  
   New DEXs/tokens/chains are added via adapters and expanded “token universe,” without refactoring core pipeline.

---

## 2. High-level System Diagram

```mermaid
flowchart LR
  subgraph Data
    WS[Arbitrum WS RPC] --> ING[ingestion-service]
    ING -->|PoolState| REDIS[(Redis hot state)]
    ING -->|DexEvent + PoolState snapshots| PG[(Postgres/Timescale)]
  end

  subgraph Brain
    REDIS --> FIND[opportunity-finder]
    FIND --> OPT[optimizer]
    OPT --> RISK[risk-engine]
  end

  subgraph Execution
    RISK -->|Decision=APPROVE| TXB[tx-builder]
    TXB --> SIM[simulator-gate]
    SIM -->|PASS| SEND[private-sender]
    SEND --> CHAIN[(Arbitrum)]
    CHAIN --> POST[post-trade-analyzer]
  end

  PG --> POST
  POST --> PG
  PG --> API[ops/api (Swagger)]
```

---

## 3. Services and Responsibilities

### 3.1 ingestion-service
**Purpose**: Subscribe to chain data, decode DEX events, maintain near-real-time pool state.

**Inputs**
- Arbitrum WS RPC (`newHeads`, `logs`)
- Contract addresses for: UniV3 WETH/USDC pool, SushiV2 WETH/USDC pair

**Outputs**
- Redis: latest `PoolState` for each tracked pool
- Postgres: append-only `dex_events`, periodic `pool_state_snapshots`

**Key concerns**
- Reliable reconnect & replay from last processed block
- Log decoding correctness and unit tests with fixtures
- Minimal latency and bounded memory growth

---

### 3.2 strategy service (opportunity-finder + optimizer + risk-engine)
**Purpose**: Convert pool state to executable plans.

**Submodules**
- **opportunity-finder**: detects price discrepancy opportunities (UniV3 vs SushiV2)
- **optimizer**: finds best trade size `x*` via deterministic numeric search + swap math simulation
- **risk-engine**: applies thresholds and fuses (net profit ≥ 10 USD, fail-streak, blacklist, TTL rules)

**Outputs**
- Postgres: `candidates`, `plans`, `decisions`

---

### 3.3 execution service (tx-builder + simulator-gate + private-sender)
**Purpose**: Build the transaction, prove it works via simulation, then send.

**Submodules**
- **tx-builder**: encodes `plan_bytes` to call `AtomicNexusExecutor.execute(plan_bytes)`
- **simulator-gate** (**mandatory**): runs fork simulation (eth_call) and classifies failures
- **private-sender**: sends signed tx via a pluggable sender interface (v1.0 may use normal RPC as placeholder)

**Outputs**
- Postgres: `sim_results`, `send_attempts`, `receipts`

---

### 3.4 post-trade-analyzer
**Purpose**: Confirm mined result, compute realized PnL, and generate structured attribution.

**Outputs**
- Postgres: `trades` (realized PnL, costs), `attribution` (reason tags)

---

### 3.5 ops/api service (Swagger)
**Purpose**: Expose operational views and traces for debugging and monitoring.

- `GET /traces/{trace_id}` returns the funnel: candidate → plan → sim → send → receipt → pnl
- Time-range listing endpoints for each stage

---

## 4. On-chain Contracts

### 4.1 AtomicNexusExecutor.sol
**Principle**: “Execution container.” No route search, no optimization math.

**Responsibilities**
- Validate plan format and step count (≤ 3 hops)
- Execute step sequence via adapters
- Enforce minimum output constraints (per-step and/or final)
- Transfer profit to `profitReceiver`
- (Phase 2) Integrate flashloan sources; v1.0 can run without flashloan to validate pipeline

### 4.2 Adapters
Adapters provide a uniform interface:
- `IAdapter.swap(bytes data) returns (uint256 amountOut)`

**v1.0 adapters**
- `UniV3Adapter`: uses Uniswap V3 SwapRouter (`exactInputSingle`)
- `SushiV2Adapter`: uses UniswapV2Router (`swapExactTokensForTokens`)

---

## 5. Core Data Model (Canonical Types)

### 5.1 Trace & IDs
- `trace_id`: UUIDv4 string generated at **Candidate** creation, propagated everywhere.
- `block_number`: latest block used for decision snapshot.
- `ttl_blocks`: max blocks after which a plan must not be sent.

### 5.2 PoolState (hot + cold)
`PoolState` represents the last-known state needed for pricing and simulation.

**UniV3 (WETH/USDC)**
- `sqrtPriceX96`, `tick`, `liquidity`, `fee`, `block_number`

**SushiV2 (WETH/USDC)**
- `reserve0`, `reserve1`, `block_number`

> v1.0 only needs mid-price + swap simulation functions.

### 5.3 Candidate
Represents an identified opportunity with a path template and rough estimate.

Fields (recommended)
- `trace_id`
- `chain`
- `token_in`, `token_out`
- `path_tokens[]` (length 2..4)
- `path_venues[]` / `path_pools[]`
- `direction` (UNI_TO_SUSHI or SUSHI_TO_UNI)
- `rough_profit_usd`, `rough_edge_bps`
- `snapshot_block`, `created_at`

### 5.4 Plan
An executable plan produced by the optimizer.

Fields (recommended)
- `trace_id`
- `amount_in_wei`
- `expected_net_profit_usd`
- `constraints`: `min_out_wei`, `max_slippage_bps`, `ttl_blocks`
- `steps[]`: each step includes adapter + swap_data + min_out for that step
- `snapshot_block`, `created_at`

### 5.5 Decision
Risk engine output.
- `trace_id`
- `approve` boolean
- `reason_code` (e.g., `RISK_BELOW_MIN_PROFIT`)
- `mode` (RESEARCH/CONSERVATIVE/SAFE)
- `created_at`

### 5.6 SimResult
Simulation gate output.
- `trace_id`
- `status` PASS/FAIL
- `fail_code` (`SIM_REVERT`, `SIM_SLIPPAGE`, `SIM_INSUFFICIENT_LIQ`, `SIM_EXPIRED_TTL`)
- `gas_estimate`, `simulated_net_profit_usd`
- `created_at`

### 5.7 Trade (Mined result)
- `trace_id`
- `tx_hash`
- `status` SENT/MINED/REVERTED/DROPPED
- `realized_profit_usd`, `gas_cost_usd`, `tip_usd`
- `block_number`, `timestamp`

---

## 6. Storage Design

### 6.1 Redis keys (hot state)
Recommended keys:
- `poolstate:arb:univ3:<pool_address>` → JSON
- `poolstate:arb:sushiv2:<pair_address>` → JSON
- `head:arb:last_block` → integer
- `fuse:fail_streak` → integer

### 6.2 Postgres schema (initial)
Tables (minimum viable):
- `dex_events` (append-only)
- `pool_state_snapshots`
- `candidates`
- `plans`
- `decisions`
- `sim_results`
- `send_attempts`
- `receipts`
- `trades`
- `attributions`

**Indexing**
- All stage tables indexed on `(trace_id)` and `(created_at)`
- Time-range queries: index `(created_at)` and optionally partition by day/week if Timescale is used

---

## 7. Simulation Gate (NO-SIM-NO-SEND)

**Policy**
- All outgoing transactions must pass simulation at a block ≥ snapshot_block and ≤ snapshot_block + ttl_blocks.
- If simulation fails, the system must persist the failure with `fail_code` and must not send.

**Simulation methods**
- v1.0: Hardhat fork + `eth_call` on `AtomicNexusExecutor.execute(plan_bytes)`
- Optional: also perform a pure-math simulation using cached PoolState for fast filtering, but it does **not** replace fork simulation.

---

## 8. Risk Management (v1.0)

Hard constraints:
- `net_profit_usd >= 10` (after gas + tip estimates)
- `ttl_blocks` default: 2–3 blocks (configurable)
- fail-streak fuse: stop after N consecutive fails (configurable)

Soft constraints (config):
- gas cap, tip cap, max amount_in_wei
- blacklist pools/tokens

---

## 9. Observability

### 9.1 Logging
Structured logs with:
- `trace_id`, `stage`, `block_number`, `pool`, `reason_code`, `latency_ms`

### 9.2 Metrics (Prometheus)
- candidates per minute
- plans approved ratio
- sim pass ratio
- send success ratio
- realized pnl (rolling)

### 9.3 Trace Funnel
`GET /traces/{trace_id}` should show all stages and artifacts.

---

## 10. Configuration

All services load config from env + `.env`.

Examples:
- `ARB_WS_RPC_URL`, `ARB_HTTP_RPC_URL`
- `UNI_V3_POOL_ADDR`, `SUSHI_V2_PAIR_ADDR`
- `MIN_NET_PROFIT_USD=10`
- `MAX_HOPS=3`
- `TTL_BLOCKS=3`
- `FAIL_STREAK_FUSE=5`

---

## 11. Testing Strategy (must-have)

- Unit tests: event decoding, swap math, optimizer convergence, risk rules
- Integration tests: plan -> simulate -> (mock) send
- Contract tests: adapter swaps + executor sequencing
- Replay test: feed historical logs to ingestion and assert deterministic candidate output

---

## 12. Deployment (v1.0)

- Local dev: docker compose
- Production later: move services to VM or k8s; keep signer isolated; ensure RPC redundancy

---

## 13. v1.0 Deliverables Checklist

- ✅ ingestion updates pool state in real time + stores snapshots  
- ✅ opportunity-finder detects UniV3 vs SushiV2 price discrepancy  
- ✅ optimizer computes `x*` + constraints  
- ✅ risk-engine enforces profit threshold ≥ $10  
- ✅ executor contract executes adapter steps  
- ✅ simulator-gate blocks unsafe transactions  
- ✅ ops API provides trace funnel and stage listings
