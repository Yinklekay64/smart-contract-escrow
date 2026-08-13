const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const FEE_BPS = 250; // 2.5%
const INTERVAL = 60; // seconds

describe("Subscription", function () {
  async function deployFixture() {
    const [owner, treasury, merchant, subscriber, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDC", "mUSDC");

    const Subscription = await ethers.getContractFactory("Subscription");
    const subscription = await Subscription.deploy(treasury.address, FEE_BPS);

    return { owner, treasury, merchant, subscriber, other, token, subscription };
  }

  function feeOn(amount) {
    return (amount * BigInt(FEE_BPS)) / 10000n;
  }

  describe("creation", function () {
    it("creates a subscription", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      const maxCharges = 5n;

      await expect(
        subscription
          .connect(subscriber)
          .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, maxCharges)
      )
        .to.emit(subscription, "SubscriptionCreated")
        .withArgs(0n, subscriber.address, merchant.address, await token.getAddress(), amount, INTERVAL, maxCharges);

      const sub = await subscription.subscriptions(0);
      expect(sub.active).to.equal(true);
      expect(sub.chargeCount).to.equal(0n);
      expect(sub.nextChargeTime).to.equal((await time.latest()) + INTERVAL);
    });

    it("reverts on invalid parameters", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      const tokenAddr = await token.getAddress();

      await expect(
        subscription.connect(subscriber).createSubscription(merchant.address, tokenAddr, 0, INTERVAL, 1)
      ).to.be.revertedWithCustomError(subscription, "ZeroAmount");

      await expect(
        subscription.connect(subscriber).createSubscription(merchant.address, tokenAddr, amount, 0, 1)
      ).to.be.revertedWithCustomError(subscription, "ZeroInterval");

      await expect(
        subscription.connect(subscriber).createSubscription(merchant.address, tokenAddr, amount, INTERVAL, 0)
      ).to.be.revertedWithCustomError(subscription, "ZeroMaxCharges");

      await expect(
        subscription.connect(subscriber).createSubscription(ethers.ZeroAddress, tokenAddr, amount, INTERVAL, 1)
      ).to.be.revertedWithCustomError(subscription, "InvalidMerchant");
    });
  });

  describe("charging", function () {
    it("pulls a charge from the approved allowance once the interval elapses", async function () {
      const { merchant, subscriber, treasury, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      const fee = feeOn(amount);
      const net = amount - fee;

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, 1);

      await token.mint(subscriber.address, amount);
      await token.connect(subscriber).approve(await subscription.getAddress(), amount);

      await time.increase(INTERVAL);

      await expect(subscription.charge(0))
        .to.emit(subscription, "SubscriptionCharged")
        .withArgs(0n, subscriber.address, 1n, amount, fee);

      expect(await token.balanceOf(merchant.address)).to.equal(net);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);

      const sub = await subscription.subscriptions(0);
      expect(sub.active).to.equal(false); // maxCharges reached
      expect(sub.chargeCount).to.equal(1n);
    });

    it("charges multiple times until maxCharges is reached", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      const maxCharges = 3n;
      const total = amount * maxCharges;

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, maxCharges);

      await token.mint(subscriber.address, total);
      await token.connect(subscriber).approve(await subscription.getAddress(), total);

      for (let i = 0; i < 3; i++) {
        await time.increase(INTERVAL);
        await subscription.charge(0);
      }

      const sub = await subscription.subscriptions(0);
      expect(sub.chargeCount).to.equal(maxCharges);
      expect(sub.active).to.equal(false);
      expect(await token.balanceOf(merchant.address)).to.equal(total - feeOn(amount) * maxCharges);
    });

    it("reverts when charging before the interval has elapsed", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, 3);

      await token.mint(subscriber.address, amount * 3n);
      await token.connect(subscriber).approve(await subscription.getAddress(), amount * 3n);

      await expect(subscription.charge(0)).to.be.revertedWithCustomError(subscription, "ChargeNotDue");
    });

    it("reverts when the allowance is insufficient", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, 3);

      // No allowance granted.
      await time.increase(INTERVAL);
      await expect(subscription.charge(0)).to.be.reverted;
    });

    it("reverts when charging an inactive subscription", async function () {
      const { merchant, subscriber, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, 1);

      await token.mint(subscriber.address, amount);
      await token.connect(subscriber).approve(await subscription.getAddress(), amount);

      await time.increase(INTERVAL);
      await subscription.charge(0);

      await time.increase(INTERVAL);
      await expect(subscription.charge(0)).to.be.revertedWithCustomError(
        subscription,
        "SubscriptionNotActive"
      );
    });
  });

  describe("cancellation", function () {
    it("lets the subscriber or merchant cancel", async function () {
      const { merchant, subscriber, other, token, subscription } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");

      await subscription
        .connect(subscriber)
        .createSubscription(merchant.address, await token.getAddress(), amount, INTERVAL, 3);

      await expect(subscription.connect(merchant).cancel(0))
        .to.emit(subscription, "SubscriptionCancelled")
        .withArgs(0n);
      expect((await subscription.subscriptions(0)).active).to.equal(false);

      await expect(subscription.connect(other).cancel(0)).to.be.revertedWithCustomError(
        subscription,
        "SubscriptionNotActive"
      );
    });
  });
});
