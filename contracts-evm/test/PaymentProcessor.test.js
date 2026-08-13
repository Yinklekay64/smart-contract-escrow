const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const FEE_BPS = 250; // 2.5%
const REFUND_WINDOW = 7 * 24 * 60 * 60; // 7 days

const ETH = ethers.ZeroAddress;

describe("PaymentProcessor", function () {
  async function deployFixture() {
    const [owner, treasury, merchant, payer, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDC", "mUSDC");

    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    const processor = await PaymentProcessor.deploy(treasury.address, FEE_BPS, REFUND_WINDOW);

    await processor.whitelistToken(await token.getAddress());

    return { owner, treasury, merchant, payer, other, token, processor };
  }

  function feeOn(amount) {
    return (amount * BigInt(FEE_BPS)) / 10000n;
  }

  describe("one-time payments", function () {
    it("pays a recipient in ETH with the fee routed to the treasury", async function () {
      const { merchant, payer, treasury, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const fee = feeOn(amount);
      const net = amount - fee;

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      const merchantBefore = await ethers.provider.getBalance(merchant.address);

      await expect(
        processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount })
      )
        .to.emit(processor, "PaymentSent")
        .withArgs(0n, payer.address, merchant.address, ETH, amount, fee);

      const payment = await processor.payments(0);
      expect(payment.payer).to.equal(payer.address);
      expect(payment.recipient).to.equal(merchant.address);
      expect(payment.amount).to.equal(amount);
      expect(payment.feeAmount).to.equal(fee);
      expect(payment.status).to.equal(0n); // Completed

      expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + fee);
      expect(await ethers.provider.getBalance(merchant.address)).to.equal(merchantBefore + net);
    });

    it("pays a recipient in a whitelisted ERC-20 with the fee routed to the treasury", async function () {
      const { merchant, payer, treasury, token, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      const fee = feeOn(amount);
      const net = amount - fee;

      await token.mint(payer.address, amount);
      await token.connect(payer).approve(await processor.getAddress(), amount);

      await expect(processor.connect(payer).pay(merchant.address, await token.getAddress(), amount))
        .to.emit(processor, "PaymentSent")
        .withArgs(0n, payer.address, merchant.address, await token.getAddress(), amount, fee);

      expect(await token.balanceOf(merchant.address)).to.equal(net);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      expect(await token.balanceOf(payer.address)).to.equal(0);
    });

    it("reverts when paying with a non-whitelisted token", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const badToken = await MockERC20.deploy("Bad", "BAD");

      await expect(
        processor.connect(payer).pay(merchant.address, await badToken.getAddress(), 1000)
      ).to.be.revertedWithCustomError(processor, "TokenNotWhitelisted");
    });

    it("reverts when ETH value does not match the amount", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      await expect(
        processor.connect(payer).pay(merchant.address, ETH, ethers.parseEther("1"), {
          value: ethers.parseEther("0.5"),
        })
      ).to.be.revertedWithCustomError(processor, "IncorrectEthValue");
    });

    it("reverts when sending ETH alongside an ERC-20 payment", async function () {
      const { merchant, payer, token, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      await token.mint(payer.address, amount);
      await token.connect(payer).approve(await processor.getAddress(), amount);

      await expect(
        processor.connect(payer).pay(merchant.address, await token.getAddress(), amount, {
          value: 1,
        })
      ).to.be.revertedWithCustomError(processor, "UnexpectedEth");
    });

    it("reverts on a zero amount or zero recipient", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      await expect(processor.connect(payer).pay(merchant.address, ETH, 0)).to.be.revertedWithCustomError(
        processor,
        "ZeroAmount"
      );
      await expect(
        processor.connect(payer).pay(ethers.ZeroAddress, ETH, 100)
      ).to.be.revertedWithCustomError(processor, "InvalidRecipient");
    });
  });

  describe("batch payments", function () {
    it("pays multiple recipients in a single transaction", async function () {
      const { merchant, payer, other, token, processor } = await loadFixture(deployFixture);
      const ethAmt = ethers.parseEther("1");
      const tokAmt = ethers.parseEther("50");

      await token.mint(payer.address, tokAmt);
      await token.connect(payer).approve(await processor.getAddress(), tokAmt);

      const inputs = [
        { recipient: merchant.address, token: ETH, amount: ethAmt },
        { recipient: other.address, token: await token.getAddress(), amount: tokAmt },
      ];

      await expect(processor.connect(payer).batchPay(inputs, { value: ethAmt }))
        .to.emit(processor, "BatchPayment")
        .withArgs(0n, 2n);

      expect((await processor.payments(0)).token).to.equal(ETH);
      expect((await processor.payments(1)).token).to.equal(await token.getAddress());
      expect(await token.balanceOf(other.address)).to.equal(tokAmt - feeOn(tokAmt));
    });

    it("reverts when the ETH value does not cover the batch", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      const inputs = [{ recipient: merchant.address, token: ETH, amount: ethers.parseEther("1") }];

      await expect(
        processor.connect(payer).batchPay(inputs, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(processor, "IncorrectEthValue");
    });

    it("reverts on an empty batch", async function () {
      const { payer, processor } = await loadFixture(deployFixture);
      await expect(processor.connect(payer).batchPay([])).to.be.revertedWithCustomError(
        processor,
        "EmptyBatch"
      );
    });
  });

  describe("refunds", function () {
    it("refunds an ETH payment within the window", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const net = amount - feeOn(amount);

      await processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount });

      await expect(processor.connect(merchant).refund(0, { value: net }))
        .to.emit(processor, "Refunded")
        .withArgs(0n, merchant.address, net);

      expect((await processor.payments(0)).status).to.equal(1n); // Refunded
    });

    it("refunds an ERC-20 payment within the window", async function () {
      const { merchant, payer, token, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      const net = amount - feeOn(amount);

      await token.mint(payer.address, amount);
      await token.connect(payer).approve(await processor.getAddress(), amount);
      await processor.connect(payer).pay(merchant.address, await token.getAddress(), amount);

      // Merchant approves the processor to pull the net amount back.
      await token.connect(merchant).approve(await processor.getAddress(), net);

      await expect(processor.connect(merchant).refund(0))
        .to.emit(processor, "Refunded")
        .withArgs(0n, merchant.address, net);

      expect(await token.balanceOf(payer.address)).to.equal(net);
      expect((await processor.payments(0)).status).to.equal(1n);
    });

    it("reverts if the refund window has elapsed", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const net = amount - feeOn(amount);

      await processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount });
      await time.increase(REFUND_WINDOW + 1);

      await expect(
        processor.connect(merchant).refund(0, { value: net })
      ).to.be.revertedWithCustomError(processor, "RefundWindowExpired");
    });

    it("reverts when a non-recipient tries to refund", async function () {
      const { merchant, payer, other, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const net = amount - feeOn(amount);

      await processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount });

      await expect(
        processor.connect(other).refund(0, { value: net })
      ).to.be.revertedWithCustomError(processor, "NotRecipient");
    });

    it("reverts when refunding twice or a non-existent payment", async function () {
      const { merchant, payer, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const net = amount - feeOn(amount);

      await processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount });
      await processor.connect(merchant).refund(0, { value: net });

      await expect(
        processor.connect(merchant).refund(0, { value: net })
      ).to.be.revertedWithCustomError(processor, "PaymentNotRefundable");

      await expect(
        processor.connect(merchant).refund(999, { value: net })
      ).to.be.revertedWithCustomError(processor, "PaymentNotRefundable");
    });
  });

  describe("access control", function () {
    it("only the fee manager can change the fee", async function () {
      const { owner, payer, processor } = await loadFixture(deployFixture);

      await expect(processor.connect(payer).setFeeBps(0)).to.be.revertedWithCustomError(
        processor,
        "AccessControlUnauthorizedAccount"
      );

      await expect(processor.connect(owner).setFeeBps(500))
        .to.emit(processor, "FeeUpdated")
        .withArgs(FEE_BPS, 500);
      expect(await processor.feeBps()).to.equal(500);
    });

    it("rejects a fee above 100%", async function () {
      const { owner, processor } = await loadFixture(deployFixture);
      await expect(processor.connect(owner).setFeeBps(10001)).to.be.revertedWithCustomError(
        processor,
        "InvalidFeeBps"
      );
    });

    it("only the whitelist manager can whitelist tokens", async function () {
      const { payer, processor } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const newToken = await MockERC20.deploy("New", "NEW");

      await expect(
        processor.connect(payer).whitelistToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(processor, "AccessControlUnauthorizedAccount");

      expect(await processor.whitelistedTokens(await newToken.getAddress())).to.equal(false);
    });
  });

  describe("pausing", function () {
    it("blocks payments while paused and resumes on unpause", async function () {
      const { owner, merchant, payer, processor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");

      await processor.connect(owner).pause();
      await expect(
        processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount })
      ).to.be.revertedWithCustomError(processor, "EnforcedPause");

      await processor.connect(owner).unpause();
      await expect(processor.connect(payer).pay(merchant.address, ETH, amount, { value: amount }))
        .to.emit(processor, "PaymentSent");
    });

    it("only the pauser role can pause", async function () {
      const { payer, processor } = await loadFixture(deployFixture);
      await expect(processor.connect(payer).pause()).to.be.revertedWithCustomError(
        processor,
        "AccessControlUnauthorizedAccount"
      );
    });
  });
});
