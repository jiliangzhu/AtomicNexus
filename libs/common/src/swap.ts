import { AtomicNexusError, invariant } from "./errors.js";
import type { SushiV2PoolState, UniV3PoolState } from "./dex.js";

const Q96 = 2n ** 96n;
const ONE_MILLION = 1_000_000n;
const TEN_THOUSAND = 10_000n;

function toBigIntNonNegative(value: number, field: string): bigint {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new AtomicNexusError("ENV_INVALID", `invalid ${field}: ${String(value)}`);
  }
  return BigInt(value);
}

export function applyFeePpm(amountIn: bigint, feePpm: number): bigint {
  invariant(amountIn >= 0n, "SWAP_SIM_INVALID", "amountIn must be >= 0");
  const fee = toBigIntNonNegative(feePpm, "feePpm");
  invariant(fee <= ONE_MILLION, "ENV_INVALID", "feePpm must be <= 1_000_000");
  return (amountIn * (ONE_MILLION - fee)) / ONE_MILLION;
}

export function applyFeeBps(amountIn: bigint, feeBps: number): bigint {
  invariant(amountIn >= 0n, "SWAP_SIM_INVALID", "amountIn must be >= 0");
  const fee = toBigIntNonNegative(feeBps, "feeBps");
  invariant(fee <= TEN_THOUSAND, "ENV_INVALID", "feeBps must be <= 10_000");
  return (amountIn * (TEN_THOUSAND - fee)) / TEN_THOUSAND;
}

export function simulateUniV3SwapExactIn(
  state: UniV3PoolState,
  opts: { zeroForOne: boolean; amountIn: bigint },
): { amountOut: bigint; newState: UniV3PoolState } {
  invariant(opts.amountIn >= 0n, "SWAP_SIM_INVALID", "amountIn must be >= 0");
  invariant(state.liquidity > 0n, "SWAP_SIM_INVALID", "liquidity must be > 0");
  invariant(state.sqrtPriceX96 > 0n, "SWAP_SIM_INVALID", "sqrtPriceX96 must be > 0");

  const amountInAfterFee = applyFeePpm(opts.amountIn, state.fee);
  if (amountInAfterFee === 0n) {
    return { amountOut: 0n, newState: { ...state } };
  }

  const sqrtPX96 = state.sqrtPriceX96;
  const L = state.liquidity;

  if (opts.zeroForOne) {
    const numerator = L * Q96 * sqrtPX96;
    const denominator = L * Q96 + amountInAfterFee * sqrtPX96;
    invariant(denominator > 0n, "SWAP_SIM_INVALID", "invalid denominator");
    const sqrtQX96 = numerator / denominator;
    invariant(sqrtQX96 > 0n, "SWAP_SIM_INVALID", "sqrtQX96 must be > 0");
    const amount1Out = (L * (sqrtPX96 - sqrtQX96)) / Q96;
    return {
      amountOut: amount1Out,
      newState: { ...state, sqrtPriceX96: sqrtQX96 },
    };
  }

  const sqrtQX96 = sqrtPX96 + (amountInAfterFee * Q96) / L;
  invariant(sqrtQX96 > sqrtPX96, "SWAP_SIM_INVALID", "sqrtQX96 must increase");
  const numerator = L * (sqrtQX96 - sqrtPX96) * Q96;
  const denominator = sqrtQX96 * sqrtPX96;
  invariant(denominator > 0n, "SWAP_SIM_INVALID", "invalid denominator");
  const amount0Out = numerator / denominator;
  return {
    amountOut: amount0Out,
    newState: { ...state, sqrtPriceX96: sqrtQX96 },
  };
}

export function simulateSushiV2SwapExactIn(
  state: SushiV2PoolState,
  opts: { zeroForOne: boolean; amountIn: bigint; feeBps: number },
): { amountOut: bigint; newState: SushiV2PoolState } {
  invariant(opts.amountIn >= 0n, "SWAP_SIM_INVALID", "amountIn must be >= 0");
  invariant(state.reserve0 >= 0n, "SWAP_SIM_INVALID", "reserve0 must be >= 0");
  invariant(state.reserve1 >= 0n, "SWAP_SIM_INVALID", "reserve1 must be >= 0");
  invariant(state.reserve0 > 0n && state.reserve1 > 0n, "SWAP_SIM_INVALID", "reserves must be > 0");

  const amountInWithFee = applyFeeBps(opts.amountIn, opts.feeBps);
  if (amountInWithFee === 0n) {
    return { amountOut: 0n, newState: { ...state } };
  }

  const feeDenom = TEN_THOUSAND;
  const feeNumer = feeDenom - toBigIntNonNegative(opts.feeBps, "feeBps");

  const reserveIn = opts.zeroForOne ? state.reserve0 : state.reserve1;
  const reserveOut = opts.zeroForOne ? state.reserve1 : state.reserve0;

  const amountInNumer = opts.amountIn * feeNumer;
  const numerator = amountInNumer * reserveOut;
  const denominator = reserveIn * feeDenom + amountInNumer;
  invariant(denominator > 0n, "SWAP_SIM_INVALID", "invalid denominator");
  const amountOut = numerator / denominator;

  invariant(amountOut > 0n, "SWAP_SIM_INVALID", "amountOut must be > 0");
  invariant(amountOut < reserveOut, "SWAP_SIM_INVALID", "amountOut exceeds reserveOut");

  const newReserveIn = reserveIn + opts.amountIn;
  const newReserveOut = reserveOut - amountOut;

  const newState: SushiV2PoolState = opts.zeroForOne
    ? { ...state, reserve0: newReserveIn, reserve1: newReserveOut }
    : { ...state, reserve0: newReserveOut, reserve1: newReserveIn };

  return { amountOut, newState };
}

