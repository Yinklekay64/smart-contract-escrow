const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { resolveConstructorArgs, verifyContract } = require("./utils");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const deploymentFile = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentFile)) {
    console.error(`No deployment record at ${deploymentFile}.`);
    console.error("Run scripts/deploy.js on this network first.");
    process.exitCode = 1;
    return;
  }

  const d = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const defaults = resolveConstructorArgs(deployer.address);

  // Prefer the values the contracts were actually deployed with.
  const treasury = d.treasury ?? defaults.treasury;
  const feeBps = d.feeBps ?? defaults.feeBps;
  const refundWindow = d.refundWindow ?? defaults.refundWindow;

  console.log(`Verifying contracts on ${network}…`);

  await verifyContract("PaymentProcessor", d.paymentProcessor, [treasury, feeBps, refundWindow]);
  await verifyContract("Invoice", d.invoice, [treasury, feeBps]);
  await verifyContract("Subscription", d.subscription, [treasury, feeBps]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
