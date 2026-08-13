import { Contract, ZeroAddress, formatUnits } from "ethers";
import { ERC20_ABI } from "./erc20";

const cache = new Map();

export async function tokenMeta(tokenAddress, signer) {
  if (!tokenAddress || tokenAddress === ZeroAddress) {
    return { decimals: 18, symbol: "ETH" };
  }
  if (cache.has(tokenAddress)) return cache.get(tokenAddress);

  const c = new Contract(tokenAddress, ERC20_ABI, signer);
  let meta;
  try {
    const [decimals, symbol] = await Promise.all([c.decimals(), c.symbol()]);
    meta = { decimals: Number(decimals), symbol };
  } catch {
    meta = { decimals: 18, symbol: "TOKEN" };
  }
  cache.set(tokenAddress, meta);
  return meta;
}

export function formatAmount(amount, meta) {
  return formatUnits(amount, meta.decimals);
}
