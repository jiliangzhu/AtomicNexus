import { AtomicNexusError, jsonStringify } from "@atomicnexus/common";
import type { PoolState } from "@atomicnexus/common";
import type { RedisClientType } from "redis";

export function poolStateKey(state: PoolState): string {
  return `poolstate:${state.chain}:${state.venue}:${state.pool_address.toLowerCase()}`;
}

export async function writePoolState(
  redis: RedisClientType,
  state: PoolState,
): Promise<void> {
  try {
    await redis.set(poolStateKey(state), jsonStringify(state));
  } catch (err: unknown) {
    throw new AtomicNexusError("REDIS_WRITE_FAILED", "failed to write poolstate", {
      cause: err,
    });
  }
}

