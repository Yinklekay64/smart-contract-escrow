const hre = require("hardhat");

const FALLBACK_FEE_BPS = 250; // 2.5%
const FALLBACK_REFUND_WINDOW = 7 * 24 * 60 * 60; // 7 days

/// Resolve constructor arguments from the environment, with sensible defaults.
/// An empty/zero TREASURY_ADDRESS falls back to the deployer.
function resolveConstructorArgs(deployerAddress) {
  const rawTreasury = process.env.TREASURY_ADDRESS || "";
  const zero = hre.ethers.ZeroAddress.toLowerCase();
  const treasury =
    !rawTreasury || rawTreasury.toLowerCase() === zero ? deployerAddress : rawTreasury;

  return {
    treasury,
    feeBps: process.env.FEE_BPS !== undefined ? Number(process.env.FEE_BPS) : FALLBACK_FEE_BPS,
    refundWindow:
      process.env.REFUND_WINDOW !== undefined
        ? Number(process.env.REFUND_WINDOW)
        : FALLBACK_REFUND_WINDOW,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// Verify a contract on Etherscan, retrying transient failures (e.g. the
/// explorer hasn't indexed the deployment yet). No-op without ETHERSCAN_API_KEY.
async function verifyContract(name, address, constructorArguments, attempts = 3) {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log(`Skipping verification of ${name} (ETHERSCAN_API_KEY not set).`);
    return;
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      console.log(`Verifying ${name} at ${address} (attempt ${attempt}/${attempts})…`);
      await hre.run("verify:verify", { address, constructorArguments });
      console.log(`✔ ${name} verified on Etherscan.`);
      return;
    } catch (error) {
      const message = error.message || String(error);
      if (message.toLowerCase().includes("already verified")) {
        console.log(`✔ ${name} is already verified.`);
        return;
      }
      if (attempt === attempts) {
        console.error(`✘ ${name} verification failed: ${message}`);
        throw error;
      }
      console.log(`  ${name} not indexed yet — retrying in 20s…`);
      await sleep(20000);
    }
  }
}

module.exports = { resolveConstructorArgs, sleep, verifyContract };
