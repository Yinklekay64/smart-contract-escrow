# smart-contract-payments

A decentralized Web3 payment system that lets users send and receive payments
on-chain — in native ETH or whitelisted ERC-20 stablecoins — with support for
invoicing and recurring subscription payments.

Built with **Hardhat** + **OpenZeppelin Contracts v5** (Solidity `^0.8.24`).

## Contracts

| Contract            | Purpose                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `PaymentProcessor`  | One-time payments in ETH/whitelisted ERC-20, platform fees, batch payments, and refunds.         |
| `Invoice`           | Merchants create on-chain invoices (amount, token, due date, memo); payers fulfill them.         |
| `Subscription`      | Recurring ERC-20 payments that pull a fixed amount from an approved allowance at defined intervals. |

### PaymentProcessor

- `pay(recipient, token, amount)` — pay directly. Use `token = address(0)` for
  ETH (send `amount` ETH with the call) or a whitelisted ERC-20.
- `batchPay(PaymentInput[])` — pay multiple recipients in one transaction.
- `refund(paymentId)` — the recipient (or an admin) refunds a completed payment
  within `refundWindow`. The payer receives the **net** amount; the platform fee
  is non-refundable.
- A configurable fee (`feeBps`, basis points) is routed to `treasury`.
- Role-based access control:
  - `FEE_MANAGER_ROLE` — set fee, treasury, refund window.
  - `WHITELIST_MANAGER_ROLE` — add/remove whitelisted tokens.
  - `PAUSER_ROLE` — pause/unpause (emergency stop).
- Protected by `ReentrancyGuard`, `Pausable`, and the checks-effects-interactions
  pattern. Events: `PaymentSent`, `BatchPayment`, `Refunded`, `FeeUpdated`,
  `TreasuryUpdated`, `TokenWhitelisted`, `TokenRemovedFromWhitelist`.

### Invoice

- `createInvoice(token, amount, dueDate, memo)` — the caller is the merchant.
  Pass `dueDate = 0` for no expiry.
- `payInvoice(invoiceId)` — pay in ETH (send `amount`) or ERC-20 (approve first).
  The fee is locked in at creation time.
- `cancelInvoice(invoiceId)` — merchant or owner only.
- Events: `InvoiceCreated`, `InvoicePaid`, `InvoiceCancelled`.

### Subscription

- `createSubscription(merchant, token, amount, interval, maxCharges)` — the caller
  is the subscriber and must approve this contract for `amount * maxCharges`.
- `charge(subscriptionId)` — anyone may call once the interval has elapsed to pull
  a charge from the subscriber's allowance to the merchant.
- `cancel(subscriptionId)` — subscriber or merchant.
- **ERC-20 only**: recurring payments use the "pull from approved allowance" model,
  which native ETH does not support.
- Events: `SubscriptionCreated`, `SubscriptionCharged`, `SubscriptionCancelled`.

## Getting started

```bash
npm install
cp .env.example .env   # fill in real values
npx hardhat compile
```

## Testing

```bash
npx hardhat test
```

The suite covers the one-time payment lifecycle (ETH/ERC-20, fee splits, batch
payments, refunds, access control, pausing), invoice create/pay/cancel, and
subscription charge/cancel flows, including failure and edge cases.

## Deployment

Local:

```bash
npx hardhat node                        # terminal 1
npx hardhat run scripts/deploy.js --network localhost   # terminal 2
```

Sepolia testnet:

```bash
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat verify --network sepolia <PaymentProcessor address> <treasury> <feeBps> <refundWindow>
```

Required `.env` values for Sepolia: `PRIVATE_KEY`, `SEPOLIA_RPC_URL` (or
`ALCHEMY_API_KEY`), and `ETHERSCAN_API_KEY` for verification. `TREASURY_ADDRESS`,
`FEE_BPS`, and `REFUND_WINDOW` configure the contracts.

## Example usage

```js
const { ethers } = require("hardhat");

// One-time ETH payment
await processor.pay(recipient, ethers.ZeroAddress, ethers.parseEther("1"), {
  value: ethers.parseEther("1"),
});

// Whitelist + pay in ERC-20
await processor.whitelistToken(tokenAddress);
await token.approve(processorAddress, amount);
await processor.pay(recipient, tokenAddress, amount);
```

## Security notes

- Never commit `.env` or private keys — use `.env.example` as the template.
- Fees are expressed in basis points (`10_000` = 100%) and are non-refundable.
- The contracts are unaudited; get a professional audit before mainnet use.
