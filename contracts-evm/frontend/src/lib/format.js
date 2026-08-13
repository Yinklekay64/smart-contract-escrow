export function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function chainName(chainId) {
  const names = {
    1: "Ethereum",
    11155111: "Sepolia",
    1337: "Localhost",
    31337: "Hardhat",
  };
  return names[chainId] || `Chain ${chainId}`;
}

export function txUrl(chainId, hash) {
  if (chainId === 1) return `https://etherscan.io/tx/${hash}`;
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  return null;
}

export function shortHash(hash) {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
