const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const FEE_BPS = 250; // 2.5%
const ETH = ethers.ZeroAddress;

describe("Invoice", function () {
  async function deployFixture() {
    const [owner, treasury, merchant, payer, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDC", "mUSDC");

    const Invoice = await ethers.getContractFactory("Invoice");
    const invoice = await Invoice.deploy(treasury.address, FEE_BPS);

    return { owner, treasury, merchant, payer, other, token, invoice };
  }

  function feeOn(amount) {
    return (amount * BigInt(FEE_BPS)) / 10000n;
  }

  describe("creation", function () {
    it("creates an invoice with the caller as merchant", async function () {
      const { merchant, invoice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");

      await expect(invoice.connect(merchant).createInvoice(ETH, amount, 0, "web design"))
        .to.emit(invoice, "InvoiceCreated")
        .withArgs(0n, merchant.address, ETH, amount, 0, "web design");

      const data = await invoice.invoices(0);
      expect(data.merchant).to.equal(merchant.address);
      expect(data.amount).to.equal(amount);
      expect(data.status).to.equal(0n); // Pending
    });

    it("reverts on a zero amount", async function () {
      const { merchant, invoice } = await loadFixture(deployFixture);
      await expect(invoice.connect(merchant).createInvoice(ETH, 0, 0, "")).to.be.revertedWithCustomError(
        invoice,
        "ZeroAmount"
      );
    });
  });

  describe("payment", function () {
    it("pays an ETH invoice and routes the fee to the treasury", async function () {
      const { merchant, payer, treasury, invoice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const fee = feeOn(amount);
      const net = amount - fee;

      await invoice.connect(merchant).createInvoice(ETH, amount, 0, "eth invoice");

      const merchantBefore = await ethers.provider.getBalance(merchant.address);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await expect(invoice.connect(payer).payInvoice(0, { value: amount }))
        .to.emit(invoice, "InvoicePaid")
        .withArgs(0n, payer.address, amount, fee);

      expect(await ethers.provider.getBalance(merchant.address)).to.equal(merchantBefore + net);
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + fee);
      expect((await invoice.invoices(0)).status).to.equal(1n); // Paid
    });

    it("pays an ERC-20 invoice and routes the fee to the treasury", async function () {
      const { merchant, payer, treasury, token, invoice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("100");
      const fee = feeOn(amount);
      const net = amount - fee;

      await invoice.connect(merchant).createInvoice(await token.getAddress(), amount, 0, "usdc invoice");

      await token.mint(payer.address, amount);
      await token.connect(payer).approve(await invoice.getAddress(), amount);

      await expect(invoice.connect(payer).payInvoice(0))
        .to.emit(invoice, "InvoicePaid")
        .withArgs(0n, payer.address, amount, fee);

      expect(await token.balanceOf(merchant.address)).to.equal(net);
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
    });

    it("reverts when paying twice", async function () {
      const { merchant, payer, invoice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");

      await invoice.connect(merchant).createInvoice(ETH, amount, 0, "x");
      await invoice.connect(payer).payInvoice(0, { value: amount });

      await expect(
        invoice.connect(payer).payInvoice(0, { value: amount })
      ).to.be.revertedWithCustomError(invoice, "InvoiceNotPending");
    });

    it("reverts after the due date has passed", async function () {
      const { merchant, payer, invoice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      const dueDate = (await time.latest()) + 60;

      await invoice.connect(merchant).createInvoice(ETH, amount, dueDate, "expires soon");
      await time.increase(61);

      await expect(
        invoice.connect(payer).payInvoice(0, { value: amount })
      ).to.be.revertedWithCustomError(invoice, "InvoiceExpired");
    });
  });

  describe("cancellation", function () {
    it("lets the merchant cancel a pending invoice", async function () {
      const { merchant, invoice } = await loadFixture(deployFixture);
      await invoice.connect(merchant).createInvoice(ETH, 1000, 0, "cancel me");

      await expect(invoice.connect(merchant).cancelInvoice(0))
        .to.emit(invoice, "InvoiceCancelled")
        .withArgs(0n);

      expect((await invoice.invoices(0)).status).to.equal(2n); // Cancelled
    });

    it("reverts when a third party tries to cancel", async function () {
      const { merchant, other, invoice } = await loadFixture(deployFixture);
      await invoice.connect(merchant).createInvoice(ETH, 1000, 0, "mine");

      await expect(invoice.connect(other).cancelInvoice(0)).to.be.revertedWithCustomError(
        invoice,
        "NotMerchant"
      );
    });
  });
});
