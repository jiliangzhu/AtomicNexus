import { AtomicNexusError, invariant } from "@atomicnexus/common";
import type { SushiV2PoolState, UniV3PoolState } from "@atomicnexus/common";
import type { RedisClientType } from "redis";

function ensureObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "poolstate is not an object");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new AtomicNexusError("POOLSTATE_INVALID", `poolstate.${field} not a string`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AtomicNexusError("POOLSTATE_INVALID", `poolstate.${field} not a number`);
  }
  return value;
}

function asBigInt(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      throw new AtomicNexusError(
        "POOLSTATE_INVALID",
        `poolstate.${field} invalid bigint string`,
      );
    }
  }
  throw new AtomicNexusError("POOLSTATE_INVALID", `poolstate.${field} not bigint`);
}

export function poolStateKey(opts: {
  chain: "arb";
  venue: "univ3" | "sushiv2";
  pool_address: string;
}): string {
  return `poolstate:${opts.chain}:${opts.venue}:${opts.pool_address.toLowerCase()}`;
}

export async function readUniV3PoolState(redis: RedisClientType, key: string): Promise<UniV3PoolState> {
  let raw: string | null;
  try {
    raw = await redis.get(key);
  } catch (err: unknown) {
    throw new AtomicNexusError("REDIS_READ_FAILED", "failed to read uni poolstate", {
      cause: err,
    });
  }
  if (raw == null) {
    throw new AtomicNexusError("POOLSTATE_MISSING", `missing uni poolstate at ${key}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "invalid uni poolstate json", {
      cause: err,
    });
  }

  const obj = ensureObject(parsed);
  const chain = asString(obj.chain, "chain");
  const venue = asString(obj.venue, "venue");
  invariant(chain === "arb", "POOLSTATE_INVALID", "poolstate.chain must be 'arb'");
  invariant(venue === "univ3", "POOLSTATE_INVALID", "poolstate.venue must be 'univ3'");

  const pool_address = asString(obj.pool_address, "pool_address").toLowerCase();
  const sqrtPriceX96 = asBigInt(obj.sqrtPriceX96, "sqrtPriceX96");
  const tick = asNumber(obj.tick, "tick");
  const liquidity = asBigInt(obj.liquidity, "liquidity");
  const fee = asNumber(obj.fee, "fee");
  const block_number = asNumber(obj.block_number, "block_number");

  return {
    chain: "arb",
    venue: "univ3",
    pool_address,
    sqrtPriceX96,
    tick,
    liquidity,
    fee,
    block_number,
  };
}

export async function readSushiV2PoolState(
  redis: RedisClientType,
  key: string,
): Promise<SushiV2PoolState> {
  let raw: string | null;
  try {
    raw = await redis.get(key);
  } catch (err: unknown) {
    throw new AtomicNexusError("REDIS_READ_FAILED", "failed to read sushi poolstate", {
      cause: err,
    });
  }
  if (raw == null) {
    throw new AtomicNexusError(
      "POOLSTATE_MISSING",
      `missing sushi poolstate at ${key}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new AtomicNexusError("POOLSTATE_INVALID", "invalid sushi poolstate json", {
      cause: err,
    });
  }

  const obj = ensureObject(parsed);
  const chain = asString(obj.chain, "chain");
  const venue = asString(obj.venue, "venue");
  invariant(chain === "arb", "POOLSTATE_INVALID", "poolstate.chain must be 'arb'");
  invariant(
    venue === "sushiv2",
    "POOLSTATE_INVALID",
    "poolstate.venue must be 'sushiv2'",
  );

  const pool_address = asString(obj.pool_address, "pool_address").toLowerCase();
  const reserve0 = asBigInt(obj.reserve0, "reserve0");
  const reserve1 = asBigInt(obj.reserve1, "reserve1");
  const block_number = asNumber(obj.block_number, "block_number");

  return {
    chain: "arb",
    venue: "sushiv2",
    pool_address,
    reserve0,
    reserve1,
    block_number,
  };
}

export async function readLastHeadBlock(redis: RedisClientType): Promise<number | null> {
  try {
    const raw = await redis.get("head:arb:last_block");
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  } catch (err: unknown) {
    throw new AtomicNexusError("REDIS_READ_FAILED", "failed to read head block", {
      cause: err,
    });
  }
}

