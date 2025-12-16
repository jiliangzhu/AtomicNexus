import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { AtomicNexusError, invariant } from "@atomicnexus/common";
import { getAddress, isAddress } from "ethers";

export type IngestionConfig = {
  service: "ingestion";
  chain: "arb";
  arb_ws_rpc_url: string;

  uni_v3_pool_addr: string;
  sushi_v2_pair_addr: string;

  weth_addr: string;
  usdc_addr: string;

  postgres_url: string;
  redis_url: string;
};

const DEFAULTS = {
  arbWsRpcUrl: "wss://arb1.arbitrum.io/ws",
  postgresUrl: "postgresql://postgres:postgres@localhost:5432/atomicnexus",
  redisUrl: "redis://localhost:6379",
  uniV3PoolAddr: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
  sushiV2PairAddr: "0x905dfcd5649217c42684f23958568e533c711aa3",
  wethAddr: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  usdcAddr: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
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

export function loadDotenv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRootEnv = path.resolve(here, "../../../.env");
  dotenv.config({ path: repoRootEnv });
  dotenv.config();
}

export function loadConfig(): IngestionConfig {
  const arb_ws_rpc_url = envString("ARB_WS_RPC_URL", DEFAULTS.arbWsRpcUrl);
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

  return {
    service: "ingestion",
    chain: "arb",
    arb_ws_rpc_url,
    uni_v3_pool_addr,
    sushi_v2_pair_addr,
    weth_addr,
    usdc_addr,
    postgres_url,
    redis_url,
  };
}

