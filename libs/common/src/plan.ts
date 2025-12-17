import type { Chain, DexVenue } from "./dex.js";
import type { TraceId } from "./ids.js";

export type PlanConstraints = {
  min_out_wei: bigint;
  max_slippage_bps: number;
  ttl_blocks: number;
};

export type PlanStep = {
  venue: DexVenue;
  pool_address: string;
  token_in: string;
  token_out: string;
};

export type Plan = {
  trace_id: TraceId;
  chain: Chain;
  amount_in_wei: bigint;
  expected_amount_out_wei: bigint;
  expected_net_profit_usd: number;
  constraints: PlanConstraints;
  steps: PlanStep[];
  snapshot_block: number;
  created_at: string;
};

