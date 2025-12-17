import { asAtomicNexusError, newTraceId } from "@atomicnexus/common";

import { optimizeCandidateToPlan } from "./optimize.js";

const SERVICE = "strategy/optimizer";

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
  const numerator = BigInt(opts.price_token1_per_token0) * pow10(opts.decimals1);
  const denominator = pow10(opts.decimals0);
  const radicand = (numerator * Q192) / denominator;
  return sqrtBigInt(radicand);
}

async function main(): Promise<void> {
  const trace_id = newTraceId();

  const weth = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
  const usdc = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8";

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
    trace_id,
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
    created_at: new Date().toISOString(),
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
    sushi,
    search: { min_in_wei: 1_000n * 10n ** 6n, max_in_wei: 500_000n * 10n ** 6n, iterations: 80 },
  });

  if (plan == null) {
    console.log(`[${SERVICE}][trace=${trace_id}] no profitable plan`);
    return;
  }

  console.log(`[${SERVICE}][trace=${trace_id}] plan`, {
    x_star_in_usdc: Number(plan.amount_in_wei) / 1e6,
    expected_net_profit_usd: plan.expected_net_profit_usd,
    constraints: {
      ttl_blocks: plan.constraints.ttl_blocks,
      max_slippage_bps: plan.constraints.max_slippage_bps,
      min_out_usdc: Number(plan.constraints.min_out_wei) / 1e6,
    },
  });
}

main().catch((err: unknown) => {
  const e = asAtomicNexusError(err, "OPTIMIZER_SEARCH_FAILED", "optimizer dry-run failed");
  const trace_id = newTraceId();
  console.error(`[${SERVICE}][trace=${trace_id}] ${e.message}`, { code: e.code });
  process.exitCode = 1;
});

