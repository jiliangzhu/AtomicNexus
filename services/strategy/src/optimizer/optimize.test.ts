import { AtomicNexusError } from "@atomicnexus/common";
import { describe, expect, it } from "vitest";

import { optimizeCandidateToPlan } from "./optimize.js";
import { simulateCandidateExactIn } from "./simulate.js";

const Q192 = 2n ** 192n;

function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrtBigInt only supports n >= 0");
  if (n < 2n) return n;

  let x0 = n;
  let x1 = (x0 + n / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) / 2n;
  }
  return x0;
}

function sqrtPriceX96FromHumanPrice(opts: {
  price_token1_per_token0: number;
  decimals0: number;
  decimals1: number;
}): bigint {
  if (!Number.isFinite(opts.price_token1_per_token0) || opts.price_token1_per_token0 <= 0) {
    throw new Error("invalid price_token1_per_token0");
  }
  if (!Number.isInteger(opts.price_token1_per_token0)) {
    throw new Error("test helper only supports integer prices");
  }

  const numerator = BigInt(opts.price_token1_per_token0) * pow10(opts.decimals1);
  const denominator = pow10(opts.decimals0);
  const radicand = (numerator * Q192) / denominator;
  return sqrtBigInt(radicand);
}

const weth = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const usdc = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8";

function baseScenario() {
  const uni = {
    chain: "arb" as const,
    venue: "univ3" as const,
    pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
    sqrtPriceX96: sqrtPriceX96FromHumanPrice({
      price_token1_per_token0: 2900,
      decimals0: 18,
      decimals1: 6,
    }),
    tick: 0,
    liquidity: 1_000_000_000_000_000_000_000_000n,
    fee: 500,
    block_number: 1,
  };

  const sushi = {
    chain: "arb" as const,
    venue: "sushiv2" as const,
    pool_address: "0x905dfcd5649217c42684f23958568e533c711aa3",
    reserve0: 1000n * 10n ** 18n,
    reserve1: 3_100_000n * 10n ** 6n,
    block_number: 1,
  };

  const candidate = {
    trace_id: "00000000-0000-0000-0000-000000000001",
    chain: "arb" as const,
    token_in: usdc,
    token_out: usdc,
    path_tokens: [usdc, weth, usdc],
    path_venues: ["univ3", "sushiv2"] as const,
    path_pools: [uni.pool_address, sushi.pool_address],
    direction: "UNI_TO_SUSHI" as const,
    rough_profit_usd: 0,
    rough_edge_bps: 0,
    snapshot_block: 1,
    created_at: "2020-01-01T00:00:00.000Z",
  };

  return { uni, sushi, candidate };
}

describe("optimizer/optimizeCandidateToPlan", () => {
  it("converges to stable x_star with expected_net > 0 (crafted scenario)", () => {
    const { uni, sushi, candidate } = baseScenario();

    const plan60 = optimizeCandidateToPlan({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      token1_decimals: 6,
      sushi_v2_fee_bps: 30,
      ttl_blocks: 3,
      max_slippage_bps: 50,
      uni,
      sushi,
      search: { min_in_wei: 1_000n * 10n ** 6n, max_in_wei: 500_000n * 10n ** 6n, iterations: 60 },
      now: new Date("2020-01-01T00:00:00.000Z"),
    });

    const plan80 = optimizeCandidateToPlan({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      token1_decimals: 6,
      sushi_v2_fee_bps: 30,
      ttl_blocks: 3,
      max_slippage_bps: 50,
      uni,
      sushi,
      search: { min_in_wei: 1_000n * 10n ** 6n, max_in_wei: 500_000n * 10n ** 6n, iterations: 80 },
      now: new Date("2020-01-01T00:00:00.000Z"),
    });

    expect(plan60).not.toBeNull();
    expect(plan80).not.toBeNull();
    expect(plan60?.amount_in_wei).toBe(plan80?.amount_in_wei);
    expect(plan80!.expected_net_profit_usd).toBeGreaterThan(0);

    const delta = 1_000_000n;
    const pLeft = simulateCandidateExactIn({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      sushi_v2_fee_bps: 30,
      uni,
      sushi,
      amount_in_wei: plan80!.amount_in_wei - delta,
    }).net_profit_wei;
    const pMid = simulateCandidateExactIn({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      sushi_v2_fee_bps: 30,
      uni,
      sushi,
      amount_in_wei: plan80!.amount_in_wei,
    }).net_profit_wei;
    const pRight = simulateCandidateExactIn({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      sushi_v2_fee_bps: 30,
      uni,
      sushi,
      amount_in_wei: plan80!.amount_in_wei + delta,
    }).net_profit_wei;

    expect(pMid).toBeGreaterThanOrEqual(pLeft);
    expect(pMid).toBeGreaterThanOrEqual(pRight);
  });

  it("profit is unimodal over sampled inputs (monotonicity around the peak)", () => {
    const { uni, sushi, candidate } = baseScenario();

    const samplesUsd = [10_000, 50_000, 90_000, 93_409, 100_000, 150_000, 200_000];
    const profits = samplesUsd.map((usd) => {
      const amountIn = BigInt(usd) * 10n ** 6n;
      const sim = simulateCandidateExactIn({
        candidate,
        weth_addr: weth,
        usdc_addr: usdc,
        sushi_v2_fee_bps: 30,
        uni,
        sushi,
        amount_in_wei: amountIn,
      });
      return sim.net_profit_wei;
    });

    const maxIdx = profits.reduce((best, v, i) => (v > profits[best] ? i : best), 0);
    for (let i = 0; i < maxIdx; i += 1) {
      expect(profits[i]).toBeLessThanOrEqual(profits[i + 1]);
    }
    for (let i = maxIdx + 1; i < profits.length; i += 1) {
      expect(profits[i]).toBeLessThanOrEqual(profits[i - 1]);
    }
  });

  it("fails with typed error on invalid candidate path", () => {
    const { uni, sushi, candidate } = baseScenario();
    const badCandidate = { ...candidate, path_tokens: [usdc, usdc, usdc] };

    try {
      optimizeCandidateToPlan({
        candidate: badCandidate,
        weth_addr: weth,
        usdc_addr: usdc,
        token1_decimals: 6,
        sushi_v2_fee_bps: 30,
        ttl_blocks: 3,
        max_slippage_bps: 50,
        uni,
        sushi,
        search: { min_in_wei: 1_000n * 10n ** 6n, max_in_wei: 10_000n * 10n ** 6n, iterations: 20 },
      });
      throw new Error("expected optimizeCandidateToPlan to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AtomicNexusError);
      expect((err as AtomicNexusError).code).toBe("OPTIMIZER_INVALID_CANDIDATE");
    }
  });

  it("returns null when no profitable x exists in bounds", () => {
    const { uni, candidate } = baseScenario();

    const sushiNoEdge = {
      chain: "arb" as const,
      venue: "sushiv2" as const,
      pool_address: "0x905dfcd5649217c42684f23958568e533c711aa3",
      reserve0: 1000n * 10n ** 18n,
      reserve1: 2_900_000n * 10n ** 6n,
      block_number: 1,
    };

    const plan = optimizeCandidateToPlan({
      candidate,
      weth_addr: weth,
      usdc_addr: usdc,
      token1_decimals: 6,
      sushi_v2_fee_bps: 30,
      ttl_blocks: 3,
      max_slippage_bps: 50,
      uni,
      sushi: sushiNoEdge,
      search: { min_in_wei: 1_000n * 10n ** 6n, max_in_wei: 200_000n * 10n ** 6n, iterations: 40 },
    });

    expect(plan).toBeNull();
  });
});

