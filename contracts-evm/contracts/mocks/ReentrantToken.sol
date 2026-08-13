// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only malicious ERC-20. On every `transferFrom` it attempts to
///         re-enter the configured target's `pay` function and bubbles up the
///         result. Used to prove the PaymentProcessor's reentrancy guard works.
contract ReentrantToken {
    string public name = "ReentrantToken";
    string public symbol = "REENT";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public target;

    function setTarget(address target_) external {
        target = target_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        // Re-entrancy attack: call back into the payment processor mid-transfer.
        if (target != address(0)) {
            (bool ok, bytes memory data) = target.call(
                abi.encodeWithSignature("pay(address,address,uint256)", to, address(this), amount)
            );
            if (!ok) {
                if (data.length > 0) {
                    assembly ("memory-safe") {
                        revert(add(data, 0x20), mload(data))
                    }
                }
                revert("ReentrancyAttemptFailed");
            }
        }

        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
