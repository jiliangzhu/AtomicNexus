import { AtomicNexusError, invariant, simulateSushiV2SwapExactIn, simulateUniV3SwapExactIn } from "@atomicnexus/common";
import type { Candidate } from "@atomicnexus/common";
import type { SushiV2PoolState, UniV3PoolState } from "@atomicnexus/common";

export type CandidateSimulationInput = {
  candidate: Candidate;
  weth_addr: string;
  usdc_addr: string;
  sushi_v2_fee_bps: number;
  uni: UniV3PoolState;
  sushi: SushiV2PoolState;
  amount_in_wei: bigint;
};

export type CandidateSimulationResult = {
  amount_in_wei: bigint;
  amount_out_wei: bigint;
  net_profit_wei: bigint;
};

function lower(addr: string): string {
  return addr.toLowerCase();
}

function validateCandidateShape(candidate: Candidate): void {
  if (
    candidate.path_tokens.length !== 3 ||
    candidate.path_venues.length !== 2 ||
    candidate.path_pools.length !== 2
  ) {
    throw new AtomicNexusError(
      "OPTIMIZER_INVALID_CANDIDATE",
      "candidate path must be USDC->WETH->USDC with 2 venues",
    );
  }
}

export function simulateCandidateExactIn(input: CandidateSimulationInput): CandidateSimulationResult {
  validateCandidateShape(input.candidate);

  const token0 = lower(input.weth_addr);
  const token1 = lower(input.usdc_addr);

  invariant(input.amount_in_wei > 0n, "SWAP_SIM_INVALID", "amount_in_wei must be > 0");

  const [t0, t1, t2] = input.candidate.path_tokens.map(lower);
  if (t0 !== token1 || t1 !== token0 || t2 !== token1) {
    throw new AtomicNexusError(
      "OPTIMIZER_INVALID_CANDIDATE",
      "candidate path_tokens must be [USDC, WETH, USDC]",
    );
  }

  let uniState: UniV3PoolState = input.uni;
  let sushiState: SushiV2PoolState = input.sushi;

  const leg0Venue = input.candidate.path_venues[0];
  const leg0Pool = lower(input.candidate.path_pools[0]);
  const leg1Venue = input.candidate.path_venues[1];
  const leg1Pool = lower(input.candidate.path_pools[1]);

  let wethOut: bigint;
  if (leg0Venue === "univ3") {
    invariant(leg0Pool === lower(uniState.pool_address), "OPTIMIZER_INVALID_CANDIDATE", "leg0 pool mismatch (univ3)");
    const res = simulateUniV3SwapExactIn(uniState, {
      zeroForOne: false,
      amountIn: input.amount_in_wei,
    });
    uniState = res.newState;
    wethOut = res.amountOut;
  } else if (leg0Venue === "sushiv2") {
    invariant(leg0Pool === lower(sushiState.pool_address), "OPTIMIZER_INVALID_CANDIDATE", "leg0 pool mismatch (sushiv2)");
    const res = simulateSushiV2SwapExactIn(sushiState, {
      zeroForOne: false,
      amountIn: input.amount_in_wei,
      feeBps: input.sushi_v2_fee_bps,
    });
    sushiState = res.newState;
    wethOut = res.amountOut;
  } else {
    throw new AtomicNexusError(
      "OPTIMIZER_INVALID_CANDIDATE",
      `unsupported venue: ${leg0Venue}`,
    );
  }

  let usdcOut: bigint;
  if (leg1Venue === "univ3") {
    invariant(leg1Pool === lower(uniState.pool_address), "OPTIMIZER_INVALID_CANDIDATE", "leg1 pool mismatch (univ3)");
    const res = simulateUniV3SwapExactIn(uniState, {
      zeroForOne: true,
      amountIn: wethOut,
    });
    uniState = res.newState;
    usdcOut = res.amountOut;
  } else if (leg1Venue === "sushiv2") {
    invariant(leg1Pool === lower(sushiState.pool_address), "OPTIMIZER_INVALID_CANDIDATE", "leg1 pool mismatch (sushiv2)");
    const res = simulateSushiV2SwapExactIn(sushiState, {
      zeroForOne: true,
      amountIn: wethOut,
      feeBps: input.sushi_v2_fee_bps,
    });
    sushiState = res.newState;
    usdcOut = res.amountOut;
  } else {
    throw new AtomicNexusError(
      "OPTIMIZER_INVALID_CANDIDATE",
      `unsupported venue: ${leg1Venue}`,
    );
  }

  return {
    amount_in_wei: input.amount_in_wei,
    amount_out_wei: usdcOut,
    net_profit_wei: usdcOut - input.amount_in_wei,
  };
}

