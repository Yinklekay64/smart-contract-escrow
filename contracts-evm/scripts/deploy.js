const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { resolveConstructorArgs, sleep, verifyContract } = require("./utils");

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { treasury, feeBps, refundWindow } = resolveConstructorArgs(deployer.address);

  const network = hre.network.name;
  const { chainId } = await hre.ethers.provider.getNetwork();
  const isLocal = network === "hardhat" || network === "localhost";
  const confirmations = isLocal ? 1 : 3;

  console.log(`Network:       ${network} (chainId ${chainId})`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Treasury:      ${treasury}`);
  console.log(`Fee:           ${feeBps} bps`);
  console.log(`Refund window: ${refundWindow}s`);
  console.log("");

  const PaymentProcessor = await hre.ethers.getContractFactory("PaymentProcessor");
  const paymentProcessor = await PaymentProcessor.deploy(treasury, feeBps, refundWindow);
  await paymentProcessor.deploymentTransaction().wait(confirmations);
  const paymentProcessorAddress = await paymentProcessor.getAddress();
  console.log(`PaymentProcessor deployed to ${paymentProcessorAddress}`);

  const Invoice = await hre.ethers.getContractFactory("Invoice");
  const invoice = await Invoice.deploy(treasury, feeBps);
  await invoice.deploymentTransaction().wait(confirmations);
  const invoiceAddress = await invoice.getAddress();
  console.log(`Invoice deployed to          ${invoiceAddress}`);

  const Subscription = await hre.ethers.getContractFactory("Subscription");
  const subscription = await Subscription.deploy(treasury, feeBps);
  await subscription.deploymentTransaction().wait(confirmations);
  const subscriptionAddress = await subscription.getAddress();
  console.log(`Subscription deployed to     ${subscriptionAddress}`);

  // Persist addresses so they can be reused by verify.js and the frontend.
  const deployment = {
    network,
    chainId: Number(chainId),
    treasury,
    feeBps,
    refundWindow,
    paymentProcessor: paymentProcessorAddress,
    invoice: invoiceAddress,
    subscription: subscriptionAddress,
  };
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const outFile = path.join(DEPLOYMENTS_DIR, `${network}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`Deployment saved to ${path.relative(process.cwd(), outFile)}`);

  if (!isLocal) {
    console.log("\nWaiting 15s for Etherscan to index the deployments…");
    await sleep(15000);
    await verifyContract("PaymentProcessor", paymentProcessorAddress, [treasury, feeBps, refundWindow]);
    await verifyContract("Invoice", invoiceAddress, [treasury, feeBps]);
    await verifyContract("Subscription", subscriptionAddress, [treasury, feeBps]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
