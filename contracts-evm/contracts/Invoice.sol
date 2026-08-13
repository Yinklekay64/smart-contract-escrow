// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Invoice
/// @notice Merchants create on-chain invoices (amount, token, due date, memo)
///         that payers fulfill with `payInvoice`. A configurable platform fee
///         is routed to a treasury. Ownable + pausable.
contract Invoice is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Fee is expressed in basis points; 10_000 == 100%.
    uint256 public constant MAX_FEE_BPS = 10_000;

    /// @notice Address that receives platform fees.
    address public treasury;
    /// @notice Current platform fee in basis points.
    uint256 public feeBps;

    enum InvoiceStatus {
        Pending,
        Paid,
        Cancelled
    }

    struct InvoiceData {
        address merchant;
        address token; // address(0) == native ETH
        uint256 amount;
        uint256 feeAmount; // locked in at creation time
        uint256 dueDate; // 0 == no due date
        string memo;
        InvoiceStatus status;
    }

    uint256 public nextInvoiceId;
    mapping(uint256 invoiceId => InvoiceData) public invoices;

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed merchant,
        address token,
        uint256 amount,
        uint256 dueDate,
        string memo
    );
    event InvoicePaid(uint256 indexed invoiceId, address indexed payer, uint256 amount, uint256 feeAmount);
    event InvoiceCancelled(uint256 indexed invoiceId);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    error ZeroAmount();
    error InvalidTreasury();
    error InvalidFeeBps();
    error IncorrectEthValue();
    error UnexpectedEth();
    error InvoiceNotPending();
    error NotMerchant();
    error InvoiceExpired();
    error EthTransferFailed();

    constructor(address treasury_, uint256 feeBps_) Ownable(msg.sender) {
        _setTreasury(treasury_);
        _setFeeBps(feeBps_);
    }

    /// @notice Create an invoice where the caller is the merchant/recipient.
    ///         Pass `dueDate = 0` for an invoice with no expiry.
    function createInvoice(address token, uint256 amount, uint256 dueDate, string calldata memo)
        external
        whenNotPaused
        returns (uint256 invoiceId)
    {
        if (amount == 0) revert ZeroAmount();

        uint256 feeAmount = _feeOn(amount);
        invoiceId = nextInvoiceId;
        nextInvoiceId = invoiceId + 1;

        invoices[invoiceId] = InvoiceData({
            merchant: msg.sender,
            token: token,
            amount: amount,
            feeAmount: feeAmount,
            dueDate: dueDate,
            memo: memo,
            status: InvoiceStatus.Pending
        });

        emit InvoiceCreated(invoiceId, msg.sender, token, amount, dueDate, memo);
    }

    /// @notice Fulfill an invoice. For ETH invoices send `amount` ETH; for ERC-20
    ///         invoices approve this contract for `amount` first.
    function payInvoice(uint256 invoiceId) external payable nonReentrant whenNotPaused {
        InvoiceData storage invoice = invoices[invoiceId];
        if (invoice.merchant == address(0) || invoice.status != InvoiceStatus.Pending) {
            revert InvoiceNotPending();
        }
        if (invoice.dueDate != 0 && block.timestamp > invoice.dueDate) {
            revert InvoiceExpired();
        }

        invoice.status = InvoiceStatus.Paid;

        uint256 netAmount = invoice.amount - invoice.feeAmount;
        if (invoice.token == address(0)) {
            if (msg.value != invoice.amount) revert IncorrectEthValue();
            _sendEth(invoice.merchant, netAmount);
            if (invoice.feeAmount > 0) {
                _sendEth(treasury, invoice.feeAmount);
            }
        } else {
            if (msg.value != 0) revert UnexpectedEth();
            IERC20(invoice.token).safeTransferFrom(msg.sender, invoice.merchant, netAmount);
            if (invoice.feeAmount > 0) {
                IERC20(invoice.token).safeTransferFrom(msg.sender, treasury, invoice.feeAmount);
            }
        }

        emit InvoicePaid(invoiceId, msg.sender, invoice.amount, invoice.feeAmount);
    }

    /// @notice Cancel a pending invoice. Only the merchant or owner may cancel.
    function cancelInvoice(uint256 invoiceId) external whenNotPaused {
        InvoiceData storage invoice = invoices[invoiceId];
        if (invoice.merchant == address(0) || invoice.status != InvoiceStatus.Pending) {
            revert InvoiceNotPending();
        }
        if (msg.sender != invoice.merchant && msg.sender != owner()) {
            revert NotMerchant();
        }

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(invoiceId);
    }

    /// @notice Set the platform fee in basis points.
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        _setFeeBps(newFeeBps);
    }

    /// @notice Set the treasury that receives platform fees.
    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
    }

    /// @notice Pause invoice creation and payment.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume invoice creation and payment.
    function unpause() external onlyOwner {
        _unpause();
    }

    function _feeOn(uint256 amount) private view returns (uint256) {
        return (amount * feeBps) / MAX_FEE_BPS;
    }

    function _setFeeBps(uint256 newFeeBps) private {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        uint256 oldFeeBps = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(oldFeeBps, newFeeBps);
    }

    function _setTreasury(address newTreasury) private {
        if (newTreasury == address(0)) revert InvalidTreasury();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function _sendEth(address to, uint256 value) private {
        (bool success, ) = to.call{value: value}("");
        if (!success) revert EthTransferFailed();
    }
}
