// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only malicious ETH receiver. When it receives ETH it tries to
///         re-enter the configured target's `pay` function, recording whether
///         the re-entrant call was blocked.
contract ReentrantReceiver {
    address public target;
    bool public reentered;
    bool public reentryBlocked;
    bytes public reentryRevertData;

    function setTarget(address target_) external {
        target = target_;
    }

    receive() external payable {
        reentered = true;
        (bool ok, bytes memory data) = target.call(
            abi.encodeWithSignature("pay(address,address,uint256)", address(this), address(0), msg.value)
        );
        reentryBlocked = !ok;
        reentryRevertData = data;
    }
}
