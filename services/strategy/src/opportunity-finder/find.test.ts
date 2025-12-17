import { AtomicNexusError } from "@atomicnexus/common";
import { describe, expect, it } from "vitest";

import { findCandidate } from "./find.js";

describe("opportunity-finder/findCandidate", () => {
  it("emits UNI_TO_SUSHI candidate when fee-adjusted edge exceeds threshold", () => {
    const Q96 = 2n ** 96n;

    const candidate = findCandidate({
      chain: "arb",
      weth_addr: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      usdc_addr: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
      token0_decimals: 18,
      token1_decimals: 6,
      sushi_v2_fee_bps: 30,
      min_edge_bps: 25,
      candidate_notional_usd: 10_000,
      snapshot_block: 100,
      now: new Date("2020-01-01T00:00:00.000Z"),
      uni: {
        chain: "arb",
        venue: "univ3",
        pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
        sqrtPriceX96: Q96,
        tick: 0,
        liquidity: 1n,
        fee: 500,
        block_number: 100,
      },
      sushi: {
        chain: "arb",
        venue: "sushiv2",
        pool_address: "0x905dfcd5649217c42684f23958568e533c711aa3",
        reserve0: 1000n,
        reserve1: 1020n,
        block_number: 100,
      },
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.direction).toBe("UNI_TO_SUSHI");
    expect(candidate?.rough_edge_bps).toBe(164);
    expect(candidate?.rough_profit_usd).toBe(164);
    expect(candidate?.path_tokens).toHaveLength(3);
    expect(candidate?.path_venues).toHaveLength(2);
    expect(candidate?.path_pools).toHaveLength(2);
    expect(candidate?.snapshot_block).toBe(100);
    expect(candidate?.created_at).toBe("2020-01-01T00:00:00.000Z");
  });

  it("throws typed error on invalid pool state", () => {
    const Q96 = 2n ** 96n;

    try {
      findCandidate({
        chain: "arb",
        weth_addr: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        usdc_addr: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        token0_decimals: 18,
        token1_decimals: 6,
        sushi_v2_fee_bps: 30,
        min_edge_bps: 25,
        candidate_notional_usd: 10_000,
        snapshot_block: 100,
        uni: {
          chain: "arb",
          venue: "univ3",
          pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
          sqrtPriceX96: Q96,
          tick: 0,
          liquidity: 1n,
          fee: 500,
          block_number: 100,
        },
        sushi: {
          chain: "arb",
          venue: "sushiv2",
          pool_address: "0x905dfcd5649217c42684f23958568e533c711aa3",
          reserve0: 0n,
          reserve1: 1020n,
          block_number: 100,
        },
      });
      throw new Error("expected findCandidate to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AtomicNexusError);
      expect((err as AtomicNexusError).code).toBe("POOLSTATE_INVALID");
    }
  });
});

