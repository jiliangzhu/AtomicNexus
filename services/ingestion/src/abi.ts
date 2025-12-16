import { Interface } from "ethers";

export const UNI_V3_POOL_ABI = [
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
] as const;

export const SUSHI_V2_PAIR_ABI = [
  "event Sync(uint112 reserve0, uint112 reserve1)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
] as const;

export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export const uniV3Iface = new Interface([...UNI_V3_POOL_ABI]);
export const sushiV2Iface = new Interface([...SUSHI_V2_PAIR_ABI]);

export const UNI_V3_SWAP_TOPIC = uniV3Iface.getEvent("Swap").topicHash;
export const SUSHI_V2_SYNC_TOPIC = sushiV2Iface.getEvent("Sync").topicHash;

