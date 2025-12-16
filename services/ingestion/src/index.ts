import { AtomicNexusError, asAtomicNexusError, newTraceId, uniV3PriceToken1PerToken0Human, v2PriceToken1PerToken0Human } from "@atomicnexus/common";
import { Contract, WebSocketProvider } from "ethers";
import { createClient } from "redis";

import { ERC20_ABI, SUSHI_V2_PAIR_ABI, SUSHI_V2_SYNC_TOPIC, UNI_V3_POOL_ABI, UNI_V3_SWAP_TOPIC } from "./abi.js";
import { loadConfig, loadDotenv } from "./config.js";
import { applySushiV2SyncToState, applyUniV3SwapToState, decodeSushiV2SyncLog, decodeUniV3SwapLog } from "./decode.js";
import { logLine } from "./log.js";
import { createPgPool, ensurePgSchema, insertDexEvent, insertPoolStateUpdate } from "./storage/postgres.js";
import { writePoolState } from "./storage/redis.js";

const SERVICE = "ingestion";

type TokenMeta = {
  address: string;
  symbol: string;
  decimals: number;
};

async function fetchTokenMeta(
  provider: WebSocketProvider,
  address: string,
): Promise<TokenMeta> {
  const token = new Contract(address, ERC20_ABI, provider);
  const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
  return {
    address: address.toLowerCase(),
    symbol: String(symbol),
    decimals: Number(decimals),
  };
}

async function main(): Promise<void> {
  loadDotenv();
  const cfg = loadConfig();
  const trace_id = newTraceId();

  logLine(SERVICE, "info", trace_id, "starting", {
    arb_ws_rpc_url: cfg.arb_ws_rpc_url,
    uni_v3_pool_addr: cfg.uni_v3_pool_addr,
    sushi_v2_pair_addr: cfg.sushi_v2_pair_addr,
    redis_url: cfg.redis_url,
    postgres_url: cfg.postgres_url,
  });

  const provider = new WebSocketProvider(cfg.arb_ws_rpc_url);
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

  const uniPool = new Contract(cfg.uni_v3_pool_addr, UNI_V3_POOL_ABI, provider);
  const sushiPair = new Contract(cfg.sushi_v2_pair_addr, SUSHI_V2_PAIR_ABI, provider);

  const [headBlock, uniToken0, uniToken1, sushiToken0, sushiToken1, uniFee] =
    await Promise.all([
      provider.getBlockNumber(),
      uniPool.token0(),
      uniPool.token1(),
      sushiPair.token0(),
      sushiPair.token1(),
      uniPool.fee(),
    ]);

  const uniToken0Addr = String(uniToken0).toLowerCase();
  const uniToken1Addr = String(uniToken1).toLowerCase();
  const sushiToken0Addr = String(sushiToken0).toLowerCase();
  const sushiToken1Addr = String(sushiToken1).toLowerCase();

  const expected0 = cfg.weth_addr;
  const expected1 = cfg.usdc_addr;

  if (uniToken0Addr !== expected0 || uniToken1Addr !== expected1) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `UniV3 pool token0/token1 mismatch: ${uniToken0Addr}/${uniToken1Addr}`,
    );
  }
  if (sushiToken0Addr !== expected0 || sushiToken1Addr !== expected1) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `SushiV2 pair token0/token1 mismatch: ${sushiToken0Addr}/${sushiToken1Addr}`,
    );
  }

  const [token0Meta, token1Meta] = await Promise.all([
    fetchTokenMeta(provider, expected0),
    fetchTokenMeta(provider, expected1),
  ]);

  logLine(SERVICE, "info", trace_id, "tokens", {
    token0: token0Meta,
    token1: token1Meta,
    uni_fee: Number(uniFee),
  });

  const [{ sqrtPriceX96, tick }, uniLiquidity, sushiReserves] = await Promise.all(
    [uniPool.slot0(), uniPool.liquidity(), sushiPair.getReserves()],
  );

  let uniState = {
    chain: cfg.chain,
    venue: "univ3" as const,
    pool_address: cfg.uni_v3_pool_addr,
    sqrtPriceX96: BigInt(sqrtPriceX96),
    tick: Number(tick),
    liquidity: BigInt(uniLiquidity),
    fee: Number(uniFee),
    block_number: headBlock,
  };

  let sushiState = {
    chain: cfg.chain,
    venue: "sushiv2" as const,
    pool_address: cfg.sushi_v2_pair_addr,
    reserve0: BigInt(sushiReserves.reserve0),
    reserve1: BigInt(sushiReserves.reserve1),
    block_number: headBlock,
  };

  const uniPrice = uniV3PriceToken1PerToken0Human({
    sqrtPriceX96: uniState.sqrtPriceX96,
    decimals0: token0Meta.decimals,
    decimals1: token1Meta.decimals,
    fractionDigits: 6,
  });
  const sushiPrice = v2PriceToken1PerToken0Human({
    reserve0: sushiState.reserve0,
    reserve1: sushiState.reserve1,
    decimals0: token0Meta.decimals,
    decimals1: token1Meta.decimals,
    fractionDigits: 6,
  });

  logLine(SERVICE, "info", trace_id, "initial mid prices", {
    block_number: headBlock,
    univ3_mid: uniPrice,
    sushiv2_mid: sushiPrice,
  });

  await Promise.all([
    writePoolState(redis, uniState),
    writePoolState(redis, sushiState),
    insertPoolStateUpdate(pg, uniState),
    insertPoolStateUpdate(pg, sushiState),
  ]);

  const uniFilter = { address: cfg.uni_v3_pool_addr, topics: [UNI_V3_SWAP_TOPIC] };
  const sushiFilter = {
    address: cfg.sushi_v2_pair_addr,
    topics: [SUSHI_V2_SYNC_TOPIC],
  };

  provider.on(uniFilter, (log) => {
    void (async () => {
      const event = decodeUniV3SwapLog({
        log,
        chain: cfg.chain,
        pool_address: cfg.uni_v3_pool_addr,
      });
      uniState = applyUniV3SwapToState({ event, uniV3Fee: Number(uniFee) });

      await Promise.all([
        writePoolState(redis, uniState),
        insertDexEvent(pg, event),
        insertPoolStateUpdate(pg, uniState),
      ]);

      logLine(SERVICE, "info", event.trace_id, "univ3 swap", {
        block_number: event.block_number,
        tx_hash: event.tx_hash,
        tick: event.tick,
      });
    })().catch((err: unknown) => {
      const e = asAtomicNexusError(err, "DECODE_INVALID_LOG", "univ3 handler failed");
      logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
    });
  });

  provider.on(sushiFilter, (log) => {
    void (async () => {
      const event = decodeSushiV2SyncLog({
        log,
        chain: cfg.chain,
        pool_address: cfg.sushi_v2_pair_addr,
      });
      sushiState = applySushiV2SyncToState({ event });

      await Promise.all([
        writePoolState(redis, sushiState),
        insertDexEvent(pg, event),
        insertPoolStateUpdate(pg, sushiState),
      ]);

      logLine(SERVICE, "info", event.trace_id, "sushiv2 sync", {
        block_number: event.block_number,
        tx_hash: event.tx_hash,
      });
    })().catch((err: unknown) => {
      const e = asAtomicNexusError(
        err,
        "DECODE_INVALID_LOG",
        "sushiv2 handler failed",
      );
      logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
    });
  });

  provider.on("block", (blockNumber) => {
    void (async () => {
      const perBlockTrace = newTraceId();
      const univ3Mid = uniV3PriceToken1PerToken0Human({
        sqrtPriceX96: uniState.sqrtPriceX96,
        decimals0: token0Meta.decimals,
        decimals1: token1Meta.decimals,
        fractionDigits: 6,
      });
      const sushiv2Mid = v2PriceToken1PerToken0Human({
        reserve0: sushiState.reserve0,
        reserve1: sushiState.reserve1,
        decimals0: token0Meta.decimals,
        decimals1: token1Meta.decimals,
        fractionDigits: 6,
      });

      await redis.set("head:arb:last_block", String(blockNumber));

      logLine(SERVICE, "info", perBlockTrace, "mid prices", {
        block_number: blockNumber,
        univ3_mid: univ3Mid,
        sushiv2_mid: sushiv2Mid,
      });
    })().catch((err: unknown) => {
      const e = asAtomicNexusError(
        err,
        "REDIS_WRITE_FAILED",
        "block handler failed",
      );
      logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    const t = newTraceId();
    logLine(SERVICE, "info", t, "shutdown", { signal });
    provider.removeAllListeners();
    const destroy = (provider as unknown as { destroy?: () => unknown }).destroy;
    const destroyed = destroy ? Promise.resolve(destroy()) : Promise.resolve();
    await Promise.allSettled([redis.quit(), pg.end(), destroyed]);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  const e = asAtomicNexusError(err, "RPC_CONNECT_FAILED", "ingestion crashed");
  const trace_id = newTraceId();
  logLine(SERVICE, "error", trace_id, e.message, { code: e.code });
  process.exitCode = 1;
});
