// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.7;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error ZeroValueNotAllowed();
error AddressZeroDetected();
error InsufficientFunds();
error OrderAlreadyCompleted();
error InsufficientContractBalance();
error InvalidOrderId();
error SameTokenNotAllowed();
error OrderNotActive();
error UnAuthorizedCaller();

contract OrderBasedSwap {
    uint256 private nextOrderId = 1;

    struct Order {
        IERC20 depositToken;
        IERC20 swapWithToken;
        uint depositAmount;
        uint swapWithAmount;
        address depositor;
        address swapBy;
        bool isActive;
        bool isCompleted;
    }

    mapping(address depositor => uint256[] orderIds) public userOrders;
    mapping(uint256 orderId => Order) public ordersById;

    event OrderCreated(
        address indexed depositor,
        IERC20 depositToken,
        IERC20 swapWithToken,
        uint256 depositAmt
    );
    event TokenSwapped(address indexed swapBy, uint256 indexed orderId);
    event OrderCancelled(address indexed cancelledBy, uint256 indexed orderId);

    function createOrder(
        IERC20 _depositToken,
        IERC20 _swapWithToken,
        uint256 _depositAmt,
        uint256 _swapWithAmt
    ) external {
        if (msg.sender == address(0)) {
            revert AddressZeroDetected();
        }

        if (_depositToken == _swapWithToken) {
            revert SameTokenNotAllowed();
        }

        if (_depositAmt <= 0 || _swapWithAmt <= 0) {
            revert ZeroValueNotAllowed();
        }
        uint256 _depositorTokenBalance = _depositToken.balanceOf(msg.sender);

        if (_depositorTokenBalance < _depositAmt) {
            revert InsufficientFunds();
        }

        _depositToken.transferFrom(msg.sender, address(this), _depositAmt);
        uint256 currentOrderId = nextOrderId;
        nextOrderId++;
        ordersById[currentOrderId] = Order(
            _depositToken,
            _swapWithToken,
            _depositAmt,
            _swapWithAmt,
            msg.sender,
            address(0),
            true,
            false
        );
        userOrders[msg.sender].push(currentOrderId);
        emit OrderCreated(
            msg.sender,
            _depositToken,
            _swapWithToken,
            _depositAmt
        );
    }

    function swapToken(uint256 _orderId) external {
        if (msg.sender == address(0)) {
            revert AddressZeroDetected();
        }

        if (_orderId >= nextOrderId || _orderId < 1) {
            revert InvalidOrderId();
        }

        Order storage order = ordersById[_orderId];
        if (order.isCompleted) {
            revert OrderAlreadyCompleted();
        }

        if (!order.isActive) {
            revert OrderNotActive();
        }

        IERC20 depositToken = order.depositToken;
        IERC20 swapWithToken = order.swapWithToken;

        if (swapWithToken.balanceOf(msg.sender) < order.swapWithAmount) {
            revert InsufficientFunds();
        }
        if (order.depositAmount > depositToken.balanceOf(address(this))) {
            revert InsufficientContractBalance();
        }

        swapWithToken.transferFrom(
            msg.sender,
            order.depositor,
            order.swapWithAmount
        );
        order.isCompleted = true;
        order.isActive = false;
        order.swapBy = msg.sender;
        depositToken.transfer(msg.sender, order.depositAmount);
        emit TokenSwapped(msg.sender, _orderId);
    }

    function cancelOrder(uint256 _orderId) external {
        if (msg.sender == address(0)) {
            revert AddressZeroDetected();
        }

        if (_orderId >= nextOrderId || _orderId < 1) {
            revert InvalidOrderId();
        }

        Order storage order = ordersById[_orderId];
        if (order.isCompleted) {
            revert OrderAlreadyCompleted();
        }

        if (!order.isActive) {
            revert OrderNotActive();
        }
        if (order.depositor != msg.sender) {
            revert UnAuthorizedCaller();
        }
        order.isActive = false;
        order.depositToken.transfer(msg.sender, order.depositAmount);
        emit OrderCancelled(msg.sender, _orderId);
    }

    
}