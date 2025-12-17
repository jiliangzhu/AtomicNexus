import { AtomicNexusError, asAtomicNexusError, newTraceId } from "@atomicnexus/common";
import { createClient } from "redis";

import { loadConfig, loadDotenv } from "./opportunity-finder/config.js";
import { findCandidate, impliedMidPricesHuman } from "./opportunity-finder/find.js";
import { logLine } from "./opportunity-finder/log.js";
import { createPgPool, ensurePgSchema, insertCandidate } from "./opportunity-finder/postgres.js";
import { poolStateKey, readLastHeadBlock, readSushiV2PoolState, readUniV3PoolState } from "./opportunity-finder/poolstate.js";

const SERVICE = "strategy";

async function main(): Promise<void> {
  loadDotenv();
  const cfg = loadConfig();
  const trace_id = newTraceId();

  logLine(SERVICE, "info", trace_id, "starting", {
    redis_url: cfg.redis_url,
    postgres_url: cfg.postgres_url,
    min_edge_bps: cfg.min_edge_bps,
    sushi_v2_fee_bps: cfg.sushi_v2_fee_bps,
    candidate_notional_usd: cfg.candidate_notional_usd,
    poll_interval_ms: cfg.poll_interval_ms,
  });

  const redis = createClient({ url: cfg.redis_url });
  await redis.connect().catch((err: unknown) => {
    throw new AtomicNexusError("REDIS_CONNECT_FAILED", "failed to connect redis", {
      cause: err,
    });
  });

  const pg = createPgPool(cfg.postgres_url);
  await pg.query("select 1").catch((err: unknown) => {
    throw new AtomicNexusError(
      "PG_CONNECT_FAILED",
      "failed to connect postgres",
      { cause: err },
    );
  });
  await ensurePgSchema(pg);

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

  let lastHead: number | null = null;
  let inFlight = false;
  const poll = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    const pollTrace = newTraceId();

    try {
      const head = await readLastHeadBlock(redis);
      if (head == null) {
        logLine(SERVICE, "warn", pollTrace, "missing head block");
        return;
      }
      if (lastHead != null && head <= lastHead) return;
      lastHead = head;

      const [uni, sushi] = await Promise.all([
        readUniV3PoolState(redis, uniKey),
        readSushiV2PoolState(redis, sushiKey),
      ]);

      const mids = impliedMidPricesHuman({
        token0_decimals: cfg.token0_decimals,
        token1_decimals: cfg.token1_decimals,
        uni,
        sushi,
      });
      logLine(SERVICE, "info", pollTrace, "mid prices", { block_number: head, ...mids });

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
        snapshot_block: head,
      });

      if (candidate == null) return;

      await insertCandidate(pg, candidate);
      logLine(SERVICE, "info", candidate.trace_id, "candidate", {
        direction: candidate.direction,
        rough_edge_bps: candidate.rough_edge_bps,
        rough_profit_usd: candidate.rough_profit_usd,
        snapshot_block: candidate.snapshot_block,
      });
    } catch (err: unknown) {
      const e = asAtomicNexusError(
        err,
        "PG_INSERT_FAILED",
        "opportunity finder loop failed",
      );
      logLine(SERVICE, "error", pollTrace, e.message, { code: e.code });
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, cfg.poll_interval_ms);
  await poll();

  const shutdown = async (signal: string): Promise<void> => {
    const t = newTraceId();
    logLine(SERVICE, "info", t, "shutdown", { signal });
    clearInterval(timer);
    await Promise.allSettled([redis.quit(), pg.end()]);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  const e = asAtomicNexusError(err, "PG_INSERT_FAILED", "strategy crashed");
  const trace_id = newTraceId();
  logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
  process.exitCode = 1;
});
