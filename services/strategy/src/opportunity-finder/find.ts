import { AtomicNexusError, newTraceId, uniV3PriceToken1PerToken0Human, uniV3PriceToken1PerToken0Ratio, v2PriceToken1PerToken0Human, v2PriceToken1PerToken0Ratio } from "@atomicnexus/common";
import type { Candidate, CandidateDirection } from "@atomicnexus/common";
import type { Ratio, SushiV2PoolState, UniV3PoolState } from "@atomicnexus/common";

const ONE_MILLION = 1_000_000n;
const ONE_TRILLION = ONE_MILLION * ONE_MILLION;

export type FindCandidateInput = {
  chain: "arb";
  weth_addr: string;
  usdc_addr: string;
  token0_decimals: number;
  token1_decimals: number;
  sushi_v2_fee_bps: number;
  min_edge_bps: number;
  candidate_notional_usd: number;
  uni: UniV3PoolState;
  sushi: SushiV2PoolState;
  snapshot_block: number;
  now?: Date;
};

function bpsToPpm(bps: number): bigint {
  if (!Number.isFinite(bps) || !Number.isInteger(bps) || bps < 0) {
    throw new AtomicNexusError("ENV_INVALID", `invalid fee bps: ${String(bps)}`);
  }
  return BigInt(bps) * 100n;
}

function edgeBpsAfterFees(opts: {
  sellPrice: Ratio;
  buyPrice: Ratio;
  sellFeePpm: bigint;
  buyFeePpm: bigint;
}): bigint {
  if (opts.sellPrice.denominator === 0n || opts.buyPrice.denominator === 0n) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "price denominator is zero");
  }
  if (opts.buyPrice.numerator === 0n) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "buy price is zero");
  }

  const feeMul = (ONE_MILLION - opts.buyFeePpm) * (ONE_MILLION - opts.sellFeePpm);
  if (feeMul < 0n) {
    throw new AtomicNexusError("ENV_INVALID", "fee ppm must be <= 1_000_000");
  }

  const factorNumer =
    opts.sellPrice.numerator * opts.buyPrice.denominator * feeMul;
  const factorDenom =
    opts.sellPrice.denominator * opts.buyPrice.numerator * ONE_TRILLION;

  if (factorDenom === 0n) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "factor denominator is zero");
  }

  const factorBps = (factorNumer * 10_000n) / factorDenom;
  return factorBps - 10_000n;
}

function computeSnapshotBlock(opts: { snapshot_block: number; uni: UniV3PoolState; sushi: SushiV2PoolState }): number {
  if (Number.isInteger(opts.snapshot_block) && opts.snapshot_block > 0) return opts.snapshot_block;
  return Math.min(opts.uni.block_number, opts.sushi.block_number);
}

export function findCandidate(input: FindCandidateInput): Candidate | null {
  const uniPrice = uniV3PriceToken1PerToken0Ratio({
    sqrtPriceX96: input.uni.sqrtPriceX96,
    decimals0: input.token0_decimals,
    decimals1: input.token1_decimals,
  });
  const sushiPrice = v2PriceToken1PerToken0Ratio({
    reserve0: input.sushi.reserve0,
    reserve1: input.sushi.reserve1,
    decimals0: input.token0_decimals,
    decimals1: input.token1_decimals,
  });

  const uniFeePpm = BigInt(input.uni.fee);
  const sushiFeePpm = bpsToPpm(input.sushi_v2_fee_bps);

  const edgeSushiToUni = edgeBpsAfterFees({
    sellPrice: uniPrice,
    buyPrice: sushiPrice,
    sellFeePpm: uniFeePpm,
    buyFeePpm: sushiFeePpm,
  });

  const edgeUniToSushi = edgeBpsAfterFees({
    sellPrice: sushiPrice,
    buyPrice: uniPrice,
    sellFeePpm: sushiFeePpm,
    buyFeePpm: uniFeePpm,
  });

  const minEdge = BigInt(input.min_edge_bps);

  let direction: CandidateDirection | null = null;
  let edgeBps: bigint | null = null;
  let venues: ["univ3", "sushiv2"] | ["sushiv2", "univ3"] | null = null;
  let pools: [string, string] | null = null;

  if (edgeUniToSushi >= minEdge && edgeUniToSushi >= edgeSushiToUni) {
    direction = "UNI_TO_SUSHI";
    edgeBps = edgeUniToSushi;
    venues = ["univ3", "sushiv2"];
    pools = [input.uni.pool_address, input.sushi.pool_address];
  } else if (edgeSushiToUni >= minEdge) {
    direction = "SUSHI_TO_UNI";
    edgeBps = edgeSushiToUni;
    venues = ["sushiv2", "univ3"];
    pools = [input.sushi.pool_address, input.uni.pool_address];
  }

  if (direction == null || edgeBps == null || venues == null || pools == null) {
    return null;
  }

  const snapshot_block = computeSnapshotBlock({
    snapshot_block: input.snapshot_block,
    uni: input.uni,
    sushi: input.sushi,
  });

  const rough_profit_usd = (input.candidate_notional_usd * Number(edgeBps)) / 10_000;

  const now = input.now ?? new Date();

  return {
    trace_id: newTraceId(),
    chain: input.chain,
    token_in: input.usdc_addr.toLowerCase(),
    token_out: input.usdc_addr.toLowerCase(),
    path_tokens: [
      input.usdc_addr.toLowerCase(),
      input.weth_addr.toLowerCase(),
      input.usdc_addr.toLowerCase(),
    ],
    path_venues: venues,
    path_pools: pools,
    direction,
    rough_profit_usd,
    rough_edge_bps: Number(edgeBps),
    snapshot_block,
    created_at: now.toISOString(),
  };
}

export function impliedMidPricesHuman(input: Pick<FindCandidateInput, "token0_decimals" | "token1_decimals" | "uni" | "sushi">): {
  univ3_mid: string;
  sushiv2_mid: string;
} {
  return {
    univ3_mid: uniV3PriceToken1PerToken0Human({
      sqrtPriceX96: input.uni.sqrtPriceX96,
      decimals0: input.token0_decimals,
      decimals1: input.token1_decimals,
      fractionDigits: 6,
    }),
    sushiv2_mid: v2PriceToken1PerToken0Human({
      reserve0: input.sushi.reserve0,
      reserve1: input.sushi.reserve1,
      decimals0: input.token0_decimals,
      decimals1: input.token1_decimals,
      fractionDigits: 6,
    }),
  };
}

