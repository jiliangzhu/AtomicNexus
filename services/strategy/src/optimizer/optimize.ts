import { AtomicNexusError } from "@atomicnexus/common";
import type { Candidate, Plan } from "@atomicnexus/common";
import type { SushiV2PoolState, UniV3PoolState } from "@atomicnexus/common";

import { ternarySearchMaxInteger } from "./search.js";
import { simulateCandidateExactIn } from "./simulate.js";

export type OptimizerInput = {
  candidate: Candidate;
  weth_addr: string;
  usdc_addr: string;
  token1_decimals: number;
  sushi_v2_fee_bps: number;
  ttl_blocks: number;
  max_slippage_bps: number;
  uni: UniV3PoolState;
  sushi: SushiV2PoolState;
  search: { min_in_wei: bigint; max_in_wei: bigint; iterations?: number };
  now?: Date;
};

function amountWeiToNumber(amountWei: bigint, decimals: number, fractionDigits = 6): number {
  const sign = amountWei < 0n ? -1 : 1;
  const abs = amountWei < 0n ? -amountWei : amountWei;
  const base = 10n ** BigInt(decimals);
  const integer = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, fractionDigits);
  return sign * Number.parseFloat(`${integer.toString()}.${fracStr}`);
}

export function optimizeCandidateToPlan(input: OptimizerInput): Plan | null {
  if (input.search.min_in_wei <= 0n || input.search.max_in_wei <= 0n) {
    throw new AtomicNexusError(
      "OPTIMIZER_SEARCH_FAILED",
      "search bounds must be > 0",
    );
  }
  if (input.search.min_in_wei > input.search.max_in_wei) {
    throw new AtomicNexusError(
      "OPTIMIZER_SEARCH_FAILED",
      "min_in_wei must be <= max_in_wei",
    );
  }
  if (!Number.isInteger(input.ttl_blocks) || input.ttl_blocks <= 0) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `invalid ttl_blocks: ${String(input.ttl_blocks)}`,
    );
  }
  if (
    !Number.isInteger(input.max_slippage_bps) ||
    input.max_slippage_bps < 0 ||
    input.max_slippage_bps > 10_000
  ) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `invalid max_slippage_bps: ${String(input.max_slippage_bps)}`,
    );
  }

  const profitAt = (x: bigint): bigint => {
    const sim = simulateCandidateExactIn({
      candidate: input.candidate,
      weth_addr: input.weth_addr,
      usdc_addr: input.usdc_addr,
      sushi_v2_fee_bps: input.sushi_v2_fee_bps,
      uni: input.uni,
      sushi: input.sushi,
      amount_in_wei: x,
    });
    return sim.net_profit_wei;
  };

  const best = ternarySearchMaxInteger({
    lo: input.search.min_in_wei,
    hi: input.search.max_in_wei,
    f: profitAt,
    iterations: input.search.iterations,
  });

  const sim = simulateCandidateExactIn({
    candidate: input.candidate,
    weth_addr: input.weth_addr,
    usdc_addr: input.usdc_addr,
    sushi_v2_fee_bps: input.sushi_v2_fee_bps,
    uni: input.uni,
    sushi: input.sushi,
    amount_in_wei: best.x,
  });

  if (sim.net_profit_wei <= 0n) return null;

  const expected_net_profit_usd = amountWeiToNumber(
    sim.net_profit_wei,
    input.token1_decimals,
    6,
  );

  const slippageMul = 10_000n - BigInt(input.max_slippage_bps);
  const min_out_wei = (sim.amount_out_wei * slippageMul) / 10_000n;
  const now = input.now ?? new Date();

  return {
    trace_id: input.candidate.trace_id,
    chain: input.candidate.chain,
    amount_in_wei: sim.amount_in_wei,
    expected_amount_out_wei: sim.amount_out_wei,
    expected_net_profit_usd,
    constraints: {
      min_out_wei,
      max_slippage_bps: input.max_slippage_bps,
      ttl_blocks: input.ttl_blocks,
    },
    steps: [
      {
        venue: input.candidate.path_venues[0],
        pool_address: input.candidate.path_pools[0],
        token_in: input.candidate.path_tokens[0],
        token_out: input.candidate.path_tokens[1],
      },
      {
        venue: input.candidate.path_venues[1],
        pool_address: input.candidate.path_pools[1],
        token_in: input.candidate.path_tokens[1],
        token_out: input.candidate.path_tokens[2],
      },
    ],
    snapshot_block: input.candidate.snapshot_block,
    created_at: now.toISOString(),
  };
}

