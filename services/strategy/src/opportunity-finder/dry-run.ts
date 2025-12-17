import { AtomicNexusError, asAtomicNexusError, newTraceId } from "@atomicnexus/common";
import { createClient } from "redis";

import { loadConfig, loadDotenv } from "./config.js";
import { findCandidate, impliedMidPricesHuman } from "./find.js";
import { logLine } from "./log.js";
import { createPgPool, ensurePgSchema, insertCandidate } from "./postgres.js";
import { poolStateKey, readLastHeadBlock, readSushiV2PoolState, readUniV3PoolState } from "./poolstate.js";

const SERVICE = "strategy";

type DryRunMode = "redis" | "synthetic";

function parseMode(argv: string[]): DryRunMode {
  if (argv.includes("--synthetic")) return "synthetic";
  if (argv.includes("--redis")) return "redis";
  return "redis";
}

function syntheticStates(): { uni: Parameters<typeof findCandidate>[0]["uni"]; sushi: Parameters<typeof findCandidate>[0]["sushi"]; snapshot_block: number } {
  const Q96 = 2n ** 96n;
  return {
    snapshot_block: 123,
    uni: {
      chain: "arb",
      venue: "univ3",
      pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
      sqrtPriceX96: Q96,
      tick: 0,
      liquidity: 1n,
      fee: 500,
      block_number: 123,
    },
    sushi: {
      chain: "arb",
      venue: "sushiv2",
      pool_address: "0x905dfcd5649217c42684f23958568e533c711aa3",
      reserve0: 1000n,
      reserve1: 1020n,
      block_number: 123,
    },
  };
}

async function main(): Promise<void> {
  loadDotenv();
  const cfg = loadConfig();
  const trace_id = newTraceId();
  const mode = parseMode(process.argv);

  logLine(SERVICE, "info", trace_id, "dry-run starting", { mode });

  const pg = createPgPool(cfg.postgres_url);
  await pg.query("select 1").catch((err: unknown) => {
    throw new AtomicNexusError(
      "PG_CONNECT_FAILED",
      "failed to connect postgres",
      { cause: err },
    );
  });
  await ensurePgSchema(pg);

  let uni = null as unknown as Parameters<typeof findCandidate>[0]["uni"];
  let sushi = null as unknown as Parameters<typeof findCandidate>[0]["sushi"];
  let snapshot_block = 0;

  let redis = null as ReturnType<typeof createClient> | null;

  try {
    if (mode === "synthetic") {
      const s = syntheticStates();
      uni = s.uni;
      sushi = s.sushi;
      snapshot_block = s.snapshot_block;
    } else {
      redis = createClient({ url: cfg.redis_url });
      await redis.connect().catch((err: unknown) => {
        throw new AtomicNexusError(
          "REDIS_CONNECT_FAILED",
          "failed to connect redis",
          { cause: err },
        );
      });

      const uniKey = poolStateKey({
        chain: cfg.chain,
        venue: "univ3",
        pool_address: cfg.uni_v3_pool_addr,
      });
      const sushiKey = poolStateKey({
        chain: cfg.chain,
        venue: "sushiv2",
        pool_address: cfg.sushi_v2_pair_addr,
      });

      const head = await readLastHeadBlock(redis);
      const [u, s] = await Promise.all([
        readUniV3PoolState(redis, uniKey),
        readSushiV2PoolState(redis, sushiKey),
      ]);
      uni = u;
      sushi = s;
      snapshot_block = head ?? Math.min(u.block_number, s.block_number);
    }

    const mids = impliedMidPricesHuman({
      token0_decimals: cfg.token0_decimals,
      token1_decimals: cfg.token1_decimals,
      uni,
      sushi,
    });
    logLine(SERVICE, "info", trace_id, "mid prices", { snapshot_block, ...mids });

    const candidate = findCandidate({
      chain: cfg.chain,
      weth_addr: cfg.weth_addr,
      usdc_addr: cfg.usdc_addr,
      token0_decimals: cfg.token0_decimals,
      token1_decimals: cfg.token1_decimals,
      sushi_v2_fee_bps: cfg.sushi_v2_fee_bps,
      min_edge_bps: cfg.min_edge_bps,
      candidate_notional_usd: cfg.candidate_notional_usd,
      uni,
      sushi,
      snapshot_block,
    });

    if (candidate == null) {
      logLine(SERVICE, "info", trace_id, "no candidate", {
        min_edge_bps: cfg.min_edge_bps,
      });
      return;
    }

    await insertCandidate(pg, candidate);
    logLine(SERVICE, "info", candidate.trace_id, "candidate", candidate);
  } finally {
    await Promise.allSettled([redis?.quit(), pg.end()]);
  }
}

main().catch((err: unknown) => {
  const e = asAtomicNexusError(err, "PG_INSERT_FAILED", "dry-run failed");
  const trace_id = newTraceId();
  logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
  process.exitCode = 1;
});

