// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Subscription
/// @notice Recurring ERC-20 payments. A subscriber approves this contract for a
///         token allowance, then anyone can call `charge` once the interval has
///         elapsed to pull a fixed amount to the merchant. A configurable fee
///         is routed to a treasury. Ownable + pausable.
/// @dev    Native ETH is intentionally unsupported: recurring payments require
///         the "pull from an approved allowance" model, which only ERC-20s offer.
contract Subscription is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Fee is expressed in basis points; 10_000 == 100%.
    uint256 public constant MAX_FEE_BPS = 10_000;

    /// @notice Address that receives platform fees.
    address public treasury;
    /// @notice Current platform fee in basis points.
    uint256 public feeBps;

    struct SubscriptionData {
        address subscriber;
        address merchant;
        address token;
        uint256 amount; // charged amount (net + fee) each interval
        uint256 interval; // seconds between charges
        uint256 maxCharges;
        uint256 chargeCount;
        uint256 nextChargeTime;
        bool active;
    }

    uint256 public nextSubscriptionId;
    mapping(uint256 subscriptionId => SubscriptionData) public subscriptions;

    event SubscriptionCreated(
        uint256 indexed subscriptionId,
        address indexed subscriber,
        address indexed merchant,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCharges
    );
    event SubscriptionCharged(
        uint256 indexed subscriptionId,
        address indexed subscriber,
        uint256 chargeCount,
        uint256 amount,
        uint256 feeAmount
    );
    event SubscriptionCancelled(uint256 indexed subscriptionId);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    error ZeroAmount();
    error ZeroInterval();
    error ZeroMaxCharges();
    error InvalidMerchant();
    error InvalidToken();
    error InvalidTreasury();
    error InvalidFeeBps();
    error SubscriptionNotActive();
    error NotAuthorized();
    error ChargeNotDue();

    constructor(address treasury_, uint256 feeBps_) Ownable(msg.sender) {
        _setTreasury(treasury_);
        _setFeeBps(feeBps_);
    }

    /// @notice Create a recurring payment to `merchant`. The caller (subscriber)
    ///         must approve this contract for `amount * maxCharges` of `token`.
    function createSubscription(
        address merchant,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCharges
    ) external whenNotPaused returns (uint256 subscriptionId) {
        if (merchant == address(0)) revert InvalidMerchant();
        if (token == address(0)) revert InvalidToken();
        if (amount == 0) revert ZeroAmount();
        if (interval == 0) revert ZeroInterval();
        if (maxCharges == 0) revert ZeroMaxCharges();

        subscriptionId = nextSubscriptionId;
        nextSubscriptionId = subscriptionId + 1;

        subscriptions[subscriptionId] = SubscriptionData({
            subscriber: msg.sender,
            merchant: merchant,
            token: token,
            amount: amount,
            interval: interval,
            maxCharges: maxCharges,
            chargeCount: 0,
            nextChargeTime: block.timestamp + interval,
            active: true
        });

        emit SubscriptionCreated(subscriptionId, msg.sender, merchant, token, amount, interval, maxCharges);
    }

    /// @notice Pull one charge from the subscriber's allowance to the merchant.
    ///         Anyone may call once the interval has elapsed.
    function charge(uint256 subscriptionId) external nonReentrant whenNotPaused {
        SubscriptionData storage sub = subscriptions[subscriptionId];
        if (sub.merchant == address(0) || !sub.active) revert SubscriptionNotActive();
        if (block.timestamp < sub.nextChargeTime) revert ChargeNotDue();

        // Checks-effects-interactions: update bookkeeping before external calls.
        sub.chargeCount += 1;
        sub.nextChargeTime += sub.interval;
        if (sub.chargeCount == sub.maxCharges) {
            sub.active = false;
        }

        uint256 feeAmount = _feeOn(sub.amount);
        uint256 netAmount = sub.amount - feeAmount;

        IERC20(sub.token).safeTransferFrom(sub.subscriber, sub.merchant, netAmount);
        if (feeAmount > 0) {
            IERC20(sub.token).safeTransferFrom(sub.subscriber, treasury, feeAmount);
        }

        emit SubscriptionCharged(subscriptionId, sub.subscriber, sub.chargeCount, sub.amount, feeAmount);
    }

    /// @notice Cancel a subscription. Only the subscriber or merchant may call.
    function cancel(uint256 subscriptionId) external whenNotPaused {
        SubscriptionData storage sub = subscriptions[subscriptionId];
        if (sub.merchant == address(0) || !sub.active) revert SubscriptionNotActive();
        if (msg.sender != sub.subscriber && msg.sender != sub.merchant) revert NotAuthorized();

        sub.active = false;
        emit SubscriptionCancelled(subscriptionId);
    }

    /// @notice Set the platform fee in basis points.
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        _setFeeBps(newFeeBps);
    }

    /// @notice Set the treasury that receives platform fees.
    function setTreasury(address newTreasury) external onlyOwner {
        _setTreasury(newTreasury);
    }

    /// @notice Pause charging and new subscriptions.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume charging and new subscriptions.
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
}
