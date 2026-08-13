const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const FEE_BPS = 250;
const REFUND_WINDOW = 7 * 24 * 60 * 60;
const ETH = ethers.ZeroAddress;

describe("Reentrancy protection", function () {
  async function deployFixture() {
    const [owner, treasury, merchant, payer] = await ethers.getSigners();

    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    const processor = await PaymentProcessor.deploy(treasury.address, FEE_BPS, REFUND_WINDOW);

    const ReentrantToken = await ethers.getContractFactory("ReentrantToken");
    const ReentrantReceiver = await ethers.getContractFactory("ReentrantReceiver");

    return { owner, treasury, merchant, payer, processor, ReentrantToken, ReentrantReceiver };
  }

  it("blocks reentrancy from a malicious ERC-20 token during pay", async function () {
    const { merchant, payer, processor, ReentrantToken } = await loadFixture(deployFixture);

    const token = await ReentrantToken.deploy();
    await token.setTarget(await processor.getAddress());
    await processor.whitelistToken(await token.getAddress());

    const amount = ethers.parseEther("100");
    await token.mint(payer.address, amount);
    await token.connect(payer).approve(await processor.getAddress(), amount);

    await expect(
      processor.connect(payer).pay(merchant.address, await token.getAddress(), amount)
    ).to.be.revertedWithCustomError(processor, "ReentrancyGuardReentrantCall");
  });

  it("blocks reentrancy from a malicious receiver during an ETH payment", async function () {
    const { payer, processor, ReentrantReceiver } = await loadFixture(deployFixture);

    const receiver = await ReentrantReceiver.deploy();
    await receiver.setTarget(await processor.getAddress());

    const amount = ethers.parseEther("1");

    // The legitimate payment still succeeds…
    await expect(
      processor.connect(payer).pay(await receiver.getAddress(), ETH, amount, { value: amount })
    ).to.emit(processor, "PaymentSent");

    // …but the receiver's attempt to re-enter was blocked.
    expect(await receiver.reentered()).to.equal(true);
    expect(await receiver.reentryBlocked()).to.equal(true);

    // The re-entrant call was rejected specifically by the ReentrancyGuard.
    const selector = processor.interface.getError("ReentrancyGuardReentrantCall").selector;
    expect(await receiver.reentryRevertData()).to.equal(selector);

    // Exactly one payment was recorded — no double-processing.
    expect(await processor.nextPaymentId()).to.equal(1n);
  });
});
