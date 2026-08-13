const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const feeBps = process.env.FEE_BPS !== undefined ? Number(process.env.FEE_BPS) : 250; // 2.5%
  const refundWindow =
    process.env.REFUND_WINDOW !== undefined
      ? Number(process.env.REFUND_WINDOW)
      : 7 * 24 * 60 * 60; // 7 days

  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Treasury: ${treasury} | Fee: ${feeBps} bps | Refund window: ${refundWindow}s`);

  const PaymentProcessor = await hre.ethers.getContractFactory("PaymentProcessor");
  const paymentProcessor = await PaymentProcessor.deploy(treasury, feeBps, refundWindow);
  await paymentProcessor.waitForDeployment();
  console.log(`PaymentProcessor deployed to: ${await paymentProcessor.getAddress()}`);

  const Invoice = await hre.ethers.getContractFactory("Invoice");
  const invoice = await Invoice.deploy(treasury, feeBps);
  await invoice.waitForDeployment();
  console.log(`Invoice deployed to: ${await invoice.getAddress()}`);

  const Subscription = await hre.ethers.getContractFactory("Subscription");
  const subscription = await Subscription.deploy(treasury, feeBps);
  await subscription.waitForDeployment();
  console.log(`Subscription deployed to: ${await subscription.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
