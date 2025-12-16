import { AtomicNexusError } from "@atomicnexus/common";
import { describe, expect, it } from "vitest";

import { sushiv2SyncFixture, univ3SwapFixture } from "./__fixtures__/logs.js";
import { decodeSushiV2SyncLog, decodeUniV3SwapLog } from "./decode.js";

describe("decodeUniV3SwapLog", () => {
  it("decodes Swap into normalized DexEvent", () => {
    const e = decodeUniV3SwapLog({
      log: univ3SwapFixture.log,
      chain: "arb",
      pool_address: univ3SwapFixture.log.address.toLowerCase(),
    });

    expect(e.type).toBe("UNIV3_SWAP");
    expect(e.venue).toBe("univ3");
    expect(e.pool_address).toBe(univ3SwapFixture.log.address.toLowerCase());
    expect(e.block_number).toBe(univ3SwapFixture.log.blockNumber);
    expect(e.tx_hash).toBe(univ3SwapFixture.log.transactionHash);
    expect(e.log_index).toBe(univ3SwapFixture.log.index);
    expect(e.sender).toBe(univ3SwapFixture.sender.toLowerCase());
    expect(e.recipient).toBe(univ3SwapFixture.recipient.toLowerCase());
    expect(e.amount0).toBe(univ3SwapFixture.amount0);
    expect(e.amount1).toBe(univ3SwapFixture.amount1);
    expect(e.sqrtPriceX96).toBe(univ3SwapFixture.sqrtPriceX96);
    expect(e.liquidity).toBe(univ3SwapFixture.liquidity);
    expect(e.tick).toBe(univ3SwapFixture.tick);
  });

  it("fails with typed error code on unexpected topic0", () => {
    const badLog = { ...univ3SwapFixture.log, topics: [`0x${"00".repeat(32)}`] };

    try {
      decodeUniV3SwapLog({
        log: badLog,
        chain: "arb",
        pool_address: univ3SwapFixture.log.address.toLowerCase(),
      });
      throw new Error("expected decode to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AtomicNexusError);
      expect((err as AtomicNexusError).code).toBe("DECODE_UNSUPPORTED_EVENT");
    }
  });
});

describe("decodeSushiV2SyncLog", () => {
  it("decodes Sync into normalized DexEvent", () => {
    const e = decodeSushiV2SyncLog({
      log: sushiv2SyncFixture.log,
      chain: "arb",
      pool_address: sushiv2SyncFixture.log.address.toLowerCase(),
    });

    expect(e.type).toBe("SUSHIV2_SYNC");
    expect(e.venue).toBe("sushiv2");
    expect(e.pool_address).toBe(sushiv2SyncFixture.log.address.toLowerCase());
    expect(e.block_number).toBe(sushiv2SyncFixture.log.blockNumber);
    expect(e.tx_hash).toBe(sushiv2SyncFixture.log.transactionHash);
    expect(e.log_index).toBe(sushiv2SyncFixture.log.index);
    expect(e.reserve0).toBe(sushiv2SyncFixture.reserve0);
    expect(e.reserve1).toBe(sushiv2SyncFixture.reserve1);
  });

  it("fails with typed error code on unexpected address", () => {
    const badLog = { ...sushiv2SyncFixture.log, address: "0x0000000000000000000000000000000000000000" };

    try {
      decodeSushiV2SyncLog({
        log: badLog,
        chain: "arb",
        pool_address: sushiv2SyncFixture.log.address.toLowerCase(),
      });
      throw new Error("expected decode to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AtomicNexusError);
      expect((err as AtomicNexusError).code).toBe("DECODE_INVALID_LOG");
    }
  });
});

