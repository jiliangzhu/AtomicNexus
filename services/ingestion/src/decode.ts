import { AtomicNexusError, newTraceId } from "@atomicnexus/common";
import type {
  DexEvent,
  SushiV2PoolState,
  SushiV2SyncEvent,
  UniV3PoolState,
  UniV3SwapEvent,
} from "@atomicnexus/common";
import type { Log } from "ethers";

import { SUSHI_V2_SYNC_TOPIC, UNI_V3_SWAP_TOPIC, sushiV2Iface, uniV3Iface } from "./abi.js";

function topic0(log: Pick<Log, "topics">): string {
  if (!Array.isArray(log.topics) || log.topics.length === 0) {
    throw new AtomicNexusError("DECODE_INVALID_LOG", "log has no topics");
  }
  return log.topics[0]?.toLowerCase() ?? "";
}

export function decodeUniV3SwapLog(opts: {
  log: Log;
  chain: "arb";
  pool_address: string;
}): UniV3SwapEvent {
  const addr = opts.log.address.toLowerCase();
  if (addr !== opts.pool_address.toLowerCase()) {
    throw new AtomicNexusError(
      "DECODE_INVALID_LOG",
      `unexpected log address: ${opts.log.address}`,
    );
  }
  if (topic0(opts.log) !== UNI_V3_SWAP_TOPIC.toLowerCase()) {
    throw new AtomicNexusError(
      "DECODE_UNSUPPORTED_EVENT",
      `unexpected topic0 for UniV3 Swap: ${topic0(opts.log)}`,
    );
  }

  const parsed = uniV3Iface.parseLog({
    topics: [...opts.log.topics],
    data: opts.log.data,
  });

  const args = parsed.args;
  return {
    trace_id: newTraceId(),
    chain: opts.chain,
    venue: "univ3",
    pool_address: opts.pool_address.toLowerCase(),
    type: "UNIV3_SWAP",
    block_number: opts.log.blockNumber,
    tx_hash: opts.log.transactionHash,
    log_index: opts.log.index,
    sender: String(args.sender).toLowerCase(),
    recipient: String(args.recipient).toLowerCase(),
    amount0: BigInt(args.amount0),
    amount1: BigInt(args.amount1),
    sqrtPriceX96: BigInt(args.sqrtPriceX96),
    liquidity: BigInt(args.liquidity),
    tick: Number(args.tick),
  };
}

export function decodeSushiV2SyncLog(opts: {
  log: Log;
  chain: "arb";
  pool_address: string;
}): SushiV2SyncEvent {
  const addr = opts.log.address.toLowerCase();
  if (addr !== opts.pool_address.toLowerCase()) {
    throw new AtomicNexusError(
      "DECODE_INVALID_LOG",
      `unexpected log address: ${opts.log.address}`,
    );
  }
  if (topic0(opts.log) !== SUSHI_V2_SYNC_TOPIC.toLowerCase()) {
    throw new AtomicNexusError(
      "DECODE_UNSUPPORTED_EVENT",
      `unexpected topic0 for SushiV2 Sync: ${topic0(opts.log)}`,
    );
  }

  const parsed = sushiV2Iface.parseLog({
    topics: [...opts.log.topics],
    data: opts.log.data,
  });

  const args = parsed.args;
  return {
    trace_id: newTraceId(),
    chain: opts.chain,
    venue: "sushiv2",
    pool_address: opts.pool_address.toLowerCase(),
    type: "SUSHIV2_SYNC",
    block_number: opts.log.blockNumber,
    tx_hash: opts.log.transactionHash,
    log_index: opts.log.index,
    reserve0: BigInt(args.reserve0),
    reserve1: BigInt(args.reserve1),
  };
}

export function applyDexEventToPoolState(opts: {
  event: DexEvent;
  previous?: UniV3PoolState | SushiV2PoolState;
  uniV3Fee: number;
}): UniV3PoolState | SushiV2PoolState {
  if (opts.event.type === "UNIV3_SWAP") {
    return applyUniV3SwapToState({ event: opts.event, uniV3Fee: opts.uniV3Fee });
  }

  if (opts.event.type === "SUSHIV2_SYNC") {
    return applySushiV2SyncToState({ event: opts.event });
  }

  throw new AtomicNexusError(
    "DECODE_UNSUPPORTED_EVENT",
    `unsupported DexEvent: ${(opts.event as DexEvent).type}`,
  );
}

export function applyUniV3SwapToState(opts: {
  event: UniV3SwapEvent;
  uniV3Fee: number;
}): UniV3PoolState {
  return {
    chain: opts.event.chain,
    venue: "univ3",
    pool_address: opts.event.pool_address,
    sqrtPriceX96: opts.event.sqrtPriceX96,
    tick: opts.event.tick,
    liquidity: opts.event.liquidity,
    fee: opts.uniV3Fee,
    block_number: opts.event.block_number,
  };
}

export function applySushiV2SyncToState(opts: {
  event: SushiV2SyncEvent;
}): SushiV2PoolState {
  return {
    chain: opts.event.chain,
    venue: "sushiv2",
    pool_address: opts.event.pool_address,
    reserve0: opts.event.reserve0,
    reserve1: opts.event.reserve1,
    block_number: opts.event.block_number,
  };
}
