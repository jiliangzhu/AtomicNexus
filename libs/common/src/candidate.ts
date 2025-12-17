import type { Chain, DexVenue } from "./dex.js";
import type { TraceId } from "./ids.js";

export type CandidateDirection = "UNI_TO_SUSHI" | "SUSHI_TO_UNI";

export type Candidate = {
  trace_id: TraceId;
  chain: Chain;

  token_in: string;
  token_out: string;

  path_tokens: string[];
  path_venues: DexVenue[];
  path_pools: string[];

  direction: CandidateDirection;

  rough_profit_usd: number;
  rough_edge_bps: number;

  snapshot_block: number;
  created_at: string;
};

