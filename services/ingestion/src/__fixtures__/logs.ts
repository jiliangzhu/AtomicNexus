import type { Log } from "ethers";

import { SUSHI_V2_SYNC_TOPIC, UNI_V3_SWAP_TOPIC, sushiV2Iface, uniV3Iface } from "../abi.js";

const POOL_UNIV3 = "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443";
const PAIR_SUSHIV2 = "0x905dfcd5649217c42684f23958568e533c711aa3";

const TX_HASH = `0x${"11".repeat(32)}`;
const BLOCK_HASH = `0x${"22".repeat(32)}`;

export const univ3SwapFixture = (() => {
  const sender = "0x1111111111111111111111111111111111111111";
  const recipient = "0x2222222222222222222222222222222222222222";

  const amount0 = -1_000_000_000_000_000_000n;
  const amount1 = 2_000_000_000n;
  const sqrtPriceX96 = 1_234_567_890_123_456_789n;
  const liquidity = 9_876_543_210_987_654n;
  const tick = -12345;

  const event = uniV3Iface.getEvent("Swap");
  const encoded = uniV3Iface.encodeEventLog(event, [
    sender,
    recipient,
    amount0,
    amount1,
    sqrtPriceX96,
    liquidity,
    tick,
  ]);

  const log: Log = {
    address: POOL_UNIV3,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: 123,
    transactionHash: TX_HASH,
    blockHash: BLOCK_HASH,
    index: 7,
    transactionIndex: 1,
    removed: false,
  };

  if (log.topics[0]?.toLowerCase() !== UNI_V3_SWAP_TOPIC.toLowerCase()) {
    throw new Error("bad univ3 swap fixture topic0");
  }

  return { log, sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick };
})();

export const sushiv2SyncFixture = (() => {
  const reserve0 = 12_345_678_901_234_567_890n;
  const reserve1 = 98_765_432_109n;

  const event = sushiV2Iface.getEvent("Sync");
  const encoded = sushiV2Iface.encodeEventLog(event, [reserve0, reserve1]);

  const log: Log = {
    address: PAIR_SUSHIV2,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: 456,
    transactionHash: TX_HASH,
    blockHash: BLOCK_HASH,
    index: 3,
    transactionIndex: 2,
    removed: false,
  };

  if (log.topics[0]?.toLowerCase() !== SUSHI_V2_SYNC_TOPIC.toLowerCase()) {
    throw new Error("bad sushiv2 sync fixture topic0");
  }

  return { log, reserve0, reserve1 };
})();

