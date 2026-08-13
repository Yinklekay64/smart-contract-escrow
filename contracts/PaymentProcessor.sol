// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PaymentProcessor
/// @notice Lets a sender pay a recipient directly in native ETH or a whitelisted
///         ERC-20 token, with an optional platform fee routed to a treasury.
///         Supports batch payments and merchant-initiated refunds within a
///         configurable window. Access is role-based; the contract is pausable.
contract PaymentProcessor is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Can update the fee and treasury.
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    /// @notice Can add/remove tokens from the whitelist.
    bytes32 public constant WHITELIST_MANAGER_ROLE = keccak256("WHITELIST_MANAGER_ROLE");
    /// @notice Can pause/unpause the contract.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Fee is expressed in basis points; 10_000 == 100%.
    uint256 public constant MAX_FEE_BPS = 10_000;

    /// @notice Address that receives platform fees.
    address public treasury;
    /// @notice Current platform fee in basis points.
    uint256 public feeBps;
    /// @notice How long after a payment a merchant may refund it (seconds).
    uint256 public refundWindow;

    /// @notice token address => whether it may be used for payments.
    mapping(address token => bool) public whitelistedTokens;

    enum PaymentStatus {
        Completed,
        Refunded
    }

    struct Payment {
        address payer;
        address recipient;
        address token; // address(0) == native ETH
        uint256 amount;
        uint256 feeAmount;
        uint256 timestamp;
        PaymentStatus status;
    }

    /// @notice Batch payment input.
    struct PaymentInput {
        address recipient;
        address token; // address(0) == native ETH
        uint256 amount;
    }

    uint256 public nextPaymentId;
    mapping(uint256 paymentId => Payment) public payments;

    /// @dev Emitted when a single payment is completed.
    event PaymentSent(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 feeAmount
    );

    /// @dev Emitted once per batchPayment call.
    event BatchPayment(uint256 indexed startPaymentId, uint256 count);

    /// @dev Emitted when a payment is refunded.
    event Refunded(uint256 indexed paymentId, address indexed recipient, uint256 amount);

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event RefundWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event TokenWhitelisted(address indexed token);
    event TokenRemovedFromWhitelist(address indexed token);

    error InvalidRecipient();
    error InvalidToken();
    error InvalidTreasury();
    error InvalidFeeBps();
    error ZeroAmount();
    error EmptyBatch();
    error IncorrectEthValue();
    error UnexpectedEth();
    error TokenNotWhitelisted(address token);
    error TokenAlreadyWhitelisted(address token);
    error PaymentNotRefundable();
    error NotRecipient();
    error RefundWindowExpired();
    error EthTransferFailed();

    constructor(address treasury_, uint256 feeBps_, uint256 refundWindow_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FEE_MANAGER_ROLE, msg.sender);
        _grantRole(WHITELIST_MANAGER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        _setTreasury(treasury_);
        _setFeeBps(feeBps_);
        refundWindow = refundWindow_;
    }

    /// @notice Pay a recipient directly in ETH (token == address(0)) or a
    ///         whitelisted ERC-20. Send `amount` ETH with the call for ETH.
    function pay(address recipient, address token, uint256 amount)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        _pay(msg.sender, recipient, token, amount, msg.value);
    }

    /// @notice Pay multiple recipients in a single transaction. For ETH entries,
    ///         msg.value must equal the sum of the ETH amounts.
    function batchPay(PaymentInput[] calldata inputs)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        uint256 length = inputs.length;
        if (length == 0) revert EmptyBatch();

        uint256 totalEth;
        for (uint256 i = 0; i < length; ) {
            if (inputs[i].token == address(0)) {
                totalEth += inputs[i].amount;
            }
            unchecked {
                ++i;
            }
        }
        if (msg.value != totalEth) revert IncorrectEthValue();

        uint256 startId = nextPaymentId;
        for (uint256 i = 0; i < length; ) {
            bool isEth = inputs[i].token == address(0);
            _pay(msg.sender, inputs[i].recipient, inputs[i].token, inputs[i].amount, isEth ? inputs[i].amount : 0);
            unchecked {
                ++i;
            }
        }

        emit BatchPayment(startId, length);
    }

    /// @notice Refund a completed payment. Only the recipient (or an admin) may
    ///         call, and only within `refundWindow`. For ERC-20 payments the
    ///         recipient must have approved this contract for the full amount;
    ///         for ETH the recipient sends `amount` ETH with the call. The
    ///         platform fee is non-refundable.
    function refund(uint256 paymentId) external payable nonReentrant {
        Payment storage payment = payments[paymentId];
        if (payment.recipient == address(0) || payment.status != PaymentStatus.Completed) {
            revert PaymentNotRefundable();
        }
        if (msg.sender != payment.recipient && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotRecipient();
        }
        if (block.timestamp > payment.timestamp + refundWindow) {
            revert RefundWindowExpired();
        }

        payment.status = PaymentStatus.Refunded;

        if (payment.token == address(0)) {
            if (msg.value != payment.amount) revert IncorrectEthValue();
            _sendEth(payment.payer, payment.amount);
        } else {
            if (msg.value != 0) revert UnexpectedEth();
            IERC20(payment.token).safeTransferFrom(payment.recipient, payment.payer, payment.amount);
        }

        emit Refunded(paymentId, payment.recipient, payment.amount);
    }

    /// @notice Set the platform fee in basis points.
    function setFeeBps(uint256 newFeeBps) external onlyRole(FEE_MANAGER_ROLE) {
        _setFeeBps(newFeeBps);
    }

    /// @notice Set the treasury that receives platform fees.
    function setTreasury(address newTreasury) external onlyRole(FEE_MANAGER_ROLE) {
        _setTreasury(newTreasury);
    }

    /// @notice Set the refund window in seconds.
    function setRefundWindow(uint256 newWindow) external onlyRole(FEE_MANAGER_ROLE) {
        uint256 oldWindow = refundWindow;
        refundWindow = newWindow;
        emit RefundWindowUpdated(oldWindow, newWindow);
    }

    /// @notice Allow an ERC-20 token to be used for payments.
    function whitelistToken(address token) external onlyRole(WHITELIST_MANAGER_ROLE) {
        if (token == address(0)) revert InvalidToken();
        if (whitelistedTokens[token]) revert TokenAlreadyWhitelisted(token);
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    /// @notice Remove an ERC-20 token from the whitelist.
    function removeWhitelistedToken(address token) external onlyRole(WHITELIST_MANAGER_ROLE) {
        whitelistedTokens[token] = false;
        emit TokenRemovedFromWhitelist(token);
    }

    /// @notice Pause payments and refunds.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume payments and refunds.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @dev Shared payment logic: computes the fee, routes funds, and records
    ///      the payment. Checks-effects-interactions is respected (the record
    ///      is written after external calls, but no state read after those
    ///      calls depends on them, and the function is nonReentrant).
    function _pay(address payer, address recipient, address token, uint256 amount, uint256 nativeValue)
        private
    {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();

        uint256 feeAmount = _feeOn(amount);
        uint256 netAmount = amount - feeAmount;

        if (token == address(0)) {
            if (nativeValue != amount) revert IncorrectEthValue();
            _sendEth(recipient, netAmount);
            if (feeAmount > 0) {
                _sendEth(treasury, feeAmount);
            }
        } else {
            if (nativeValue != 0) revert UnexpectedEth();
            if (!whitelistedTokens[token]) revert TokenNotWhitelisted(token);
            IERC20(token).safeTransferFrom(payer, recipient, netAmount);
            if (feeAmount > 0) {
                IERC20(token).safeTransferFrom(payer, treasury, feeAmount);
            }
        }

        uint256 id = nextPaymentId;
        nextPaymentId = id + 1;
        payments[id] = Payment({
            payer: payer,
            recipient: recipient,
            token: token,
            amount: amount,
            feeAmount: feeAmount,
            timestamp: block.timestamp,
            status: PaymentStatus.Completed
        });

        emit PaymentSent(id, payer, recipient, token, amount, feeAmount);
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
