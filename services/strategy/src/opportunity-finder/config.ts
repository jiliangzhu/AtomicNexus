import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { AtomicNexusError, invariant } from "@atomicnexus/common";
import { getAddress, isAddress } from "ethers";

export type OpportunityFinderConfig = {
  service: "strategy";
  chain: "arb";

  redis_url: string;
  postgres_url: string;

  uni_v3_pool_addr: string;
  sushi_v2_pair_addr: string;

  weth_addr: string;
  usdc_addr: string;

  token0_decimals: number;
  token1_decimals: number;

  sushi_v2_fee_bps: number;
  min_edge_bps: number;
  candidate_notional_usd: number;

  poll_interval_ms: number;
};

const DEFAULTS = {
  postgresUrl: "postgresql://postgres:postgres@localhost:5433/atomicnexus",
  redisUrl: "redis://localhost:6380",
  uniV3PoolAddr: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
  sushiV2PairAddr: "0x905dfcd5649217c42684f23958568e533c711aa3",
  wethAddr: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  usdcAddr: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
  token0Decimals: 18,
  token1Decimals: 6,
  sushiV2FeeBps: 30,
  minEdgeBps: 25,
  candidateNotionalUsd: 10_000,
  pollIntervalMs: 1_000,
} as const;

function normalizeAddress(value: string, nameForError: string): string {
  invariant(value.length > 0, "ENV_MISSING", `missing ${nameForError}`);
  if (!isAddress(value)) {
    throw new AtomicNexusError(
      "ENV_INVALID",
      `invalid ${nameForError}: ${value}`,
    );
  }
  return getAddress(value).toLowerCase();
}

function envString(name: string, fallback: string): string {
  const v = process.env[name];
  if (v == null || v.trim().length === 0) return fallback;
  return v.trim();
}

function envInt(name: string, fallback: number): number {
  const raw = envString(name, String(fallback));
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new AtomicNexusError("ENV_INVALID", `invalid ${name}: ${raw}`);
  }
  return n;
}

function envNumber(name: string, fallback: number): number {
  const raw = envString(name, String(fallback));
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new AtomicNexusError("ENV_INVALID", `invalid ${name}: ${raw}`);
  }
  return n;
}

export function loadDotenv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRootEnv = path.resolve(here, "../../../../.env");
  dotenv.config({ path: repoRootEnv });
  dotenv.config();
}

export function loadConfig(): OpportunityFinderConfig {
  const postgres_url = envString("POSTGRES_URL", DEFAULTS.postgresUrl);
  const redis_url = envString("REDIS_URL", DEFAULTS.redisUrl);

  const uni_v3_pool_addr = normalizeAddress(
    envString("UNI_V3_POOL_ADDR", DEFAULTS.uniV3PoolAddr),
    "UNI_V3_POOL_ADDR",
  );

  const sushi_v2_pair_addr = normalizeAddress(
    envString("SUSHI_V2_PAIR_ADDR", DEFAULTS.sushiV2PairAddr),
    "SUSHI_V2_PAIR_ADDR",
  );

  const weth_addr = normalizeAddress(
    envString("WETH_ADDR", DEFAULTS.wethAddr),
    "WETH_ADDR",
  );
  const usdc_addr = normalizeAddress(
    envString("USDC_ADDR", DEFAULTS.usdcAddr),
    "USDC_ADDR",
  );

  const token0_decimals = envInt("TOKEN0_DECIMALS", DEFAULTS.token0Decimals);
  const token1_decimals = envInt("TOKEN1_DECIMALS", DEFAULTS.token1Decimals);

  const sushi_v2_fee_bps = envInt("SUSHI_V2_FEE_BPS", DEFAULTS.sushiV2FeeBps);
  const min_edge_bps = envInt("MIN_EDGE_BPS", DEFAULTS.minEdgeBps);
  const candidate_notional_usd = envNumber(
    "CANDIDATE_NOTIONAL_USD",
    DEFAULTS.candidateNotionalUsd,
  );
  const poll_interval_ms = envInt("POLL_INTERVAL_MS", DEFAULTS.pollIntervalMs);

  invariant(sushi_v2_fee_bps >= 0, "ENV_INVALID", "SUSHI_V2_FEE_BPS must be >= 0");
  invariant(min_edge_bps >= 0, "ENV_INVALID", "MIN_EDGE_BPS must be >= 0");
  invariant(
    candidate_notional_usd > 0,
    "ENV_INVALID",
    "CANDIDATE_NOTIONAL_USD must be > 0",
  );
  invariant(poll_interval_ms >= 100, "ENV_INVALID", "POLL_INTERVAL_MS must be >= 100");

  return {
    service: "strategy",
    chain: "arb",
    redis_url,
    postgres_url,
    uni_v3_pool_addr,
    sushi_v2_pair_addr,
    weth_addr,
    usdc_addr,
    token0_decimals,
    token1_decimals,
    sushi_v2_fee_bps,
    min_edge_bps,
    candidate_notional_usd,
    poll_interval_ms,
  };
}

