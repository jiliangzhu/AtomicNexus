import { AtomicNexusError } from "./errors.js";

export type Chain = "arb";
export type DexVenue = "univ3" | "sushiv2";

export type DexEventBase = {
  trace_id: string;
  chain: Chain;
  venue: DexVenue;
  pool_address: string;
  block_number: number;
  tx_hash: string;
  log_index: number;
};

export type UniV3SwapEvent = DexEventBase & {
  type: "UNIV3_SWAP";
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
};

export type SushiV2SyncEvent = DexEventBase & {
  type: "SUSHIV2_SYNC";
  reserve0: bigint;
  reserve1: bigint;
};

export type DexEvent = UniV3SwapEvent | SushiV2SyncEvent;

export type UniV3PoolState = {
  chain: Chain;
  venue: "univ3";
  pool_address: string;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  fee: number;
  block_number: number;
};

export type SushiV2PoolState = {
  chain: Chain;
  venue: "sushiv2";
  pool_address: string;
  reserve0: bigint;
  reserve1: bigint;
  block_number: number;
};

export type PoolState = UniV3PoolState | SushiV2PoolState;

export type Ratio = { numerator: bigint; denominator: bigint };

const Q192 = 2n ** 192n;

function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `invalid decimals: ${String(decimals)}`,
    );
  }
  return 10n ** BigInt(decimals);
}

export function formatRatio(
  numerator: bigint,
  denominator: bigint,
  fractionDigits = 6,
): string {
  if (denominator === 0n) {
    throw new AtomicNexusError("DECODE_INVALID_LOG", "division by zero");
  }
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `invalid fractionDigits: ${String(fractionDigits)}`,
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (numerator * scale) / denominator;
  const integer = scaled / scale;
  const frac = scaled % scale;
  return `${integer.toString()}.${frac.toString().padStart(fractionDigits, "0")}`;
}

export function uniV3PriceToken1PerToken0Ratio(opts: {
  sqrtPriceX96: bigint;
  decimals0: number;
  decimals1: number;
}): Ratio {
  return {
    numerator: opts.sqrtPriceX96 * opts.sqrtPriceX96 * pow10(opts.decimals0),
    denominator: Q192 * pow10(opts.decimals1),
  };
}

export function uniV3PriceToken1PerToken0Human(opts: {
  sqrtPriceX96: bigint;
  decimals0: number;
  decimals1: number;
  fractionDigits?: number;
}): string {
  const fractionDigits = opts.fractionDigits ?? 6;
  const { numerator, denominator } = uniV3PriceToken1PerToken0Ratio(opts);
  return formatRatio(numerator, denominator, fractionDigits);
}

export function v2PriceToken1PerToken0Ratio(opts: {
  reserve0: bigint;
  reserve1: bigint;
  decimals0: number;
  decimals1: number;
}): Ratio {
  return {
    numerator: opts.reserve1 * pow10(opts.decimals0),
    denominator: opts.reserve0 * pow10(opts.decimals1),
  };
}

export function v2PriceToken1PerToken0Human(opts: {
  reserve0: bigint;
  reserve1: bigint;
  decimals0: number;
  decimals1: number;
  fractionDigits?: number;
}): string {
  const fractionDigits = opts.fractionDigits ?? 6;
  const { numerator, denominator } = v2PriceToken1PerToken0Ratio(opts);
  return formatRatio(numerator, denominator, fractionDigits);
}
