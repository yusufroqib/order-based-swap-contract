import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OrderBasedSwap", function () {
	async function deployFixture() {
		const [owner, user1, user2]: SignerWithAddress[] =
			await ethers.getSigners();

		const MockToken = await ethers.getContractFactory("Web3CXI");
		const tokenA = await MockToken.deploy();
		const tokenB = await MockToken.deploy();

		const OrderBasedSwap = await ethers.getContractFactory("OrderBasedSwap");
		const orderBasedSwap = await OrderBasedSwap.deploy();

		// Transfer some tokens to users
		await tokenA.transfer(user1.address, ethers.parseEther("1000"));
		await tokenB.transfer(user2.address, ethers.parseEther("1000"));

		return { orderBasedSwap, tokenA, tokenB, owner, user1, user2 };
	}

	describe("createOrder", function () {
		it("Should create an order successfully", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1 } = await loadFixture(
				deployFixture
			);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);

			await expect(
				orderBasedSwap
					.connect(user1)
					.createOrder(tokenA, tokenB, depositAmount, swapAmount)
			)
				.to.emit(orderBasedSwap, "OrderCreated")
				.withArgs(user1.address, tokenA, tokenB, depositAmount);

			const order = await orderBasedSwap.ordersById(1);
			expect(order.depositToken).to.equal(tokenA);
			expect(order.swapWithToken).to.equal(tokenB);
			expect(order.depositAmount).to.equal(depositAmount);
			expect(order.swapWithAmount).to.equal(swapAmount);
			expect(order.depositor).to.equal(user1.address);
			expect(order.isCompleted).to.be.false;
		});

        it("Should revert if using same token", async function() {
            const { orderBasedSwap, tokenA, user1 } = await loadFixture(deployFixture);
            const depositAmount = ethers.parseEther("100");
            const swapAmount = ethers.parseEther("200");

            await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);

            await expect(
                orderBasedSwap
                    .connect(user1)
                    .createOrder(tokenA, tokenA, depositAmount, swapAmount)
            ).to.be.revertedWithCustomError(orderBasedSwap, "SameTokenNotAllowed");
        })

		it("Should revert when creating an order with zero amount", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1 } = await loadFixture(
				deployFixture
			);
			await expect(
				orderBasedSwap
					.connect(user1)
					.createOrder(tokenA, tokenB, 0, ethers.parseEther("100"))
			).to.be.revertedWithCustomError(orderBasedSwap, "ZeroValueNotAllowed");
		});

		it("Should revert when creating an order with insufficient funds", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1 } = await loadFixture(
				deployFixture
			);
			const largeAmount = ethers.parseEther("10000");
			await expect(
				orderBasedSwap
					.connect(user1)
					.createOrder(tokenA, tokenB, largeAmount, ethers.parseEther("100"))
			).to.be.revertedWithCustomError(orderBasedSwap, "InsufficientFunds");
		});
	});

	describe("swapToken", function () {
		it("Should swap tokens successfully", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1, user2 } =
				await loadFixture(deployFixture);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			// Create order
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);

			// Swap tokens
			await tokenB.connect(user2).approve(orderBasedSwap, swapAmount);
			await expect(orderBasedSwap.connect(user2).swapToken(1))
				.to.emit(orderBasedSwap, "TokenSwapped")
				.withArgs(user2.address, 1);

			// Check balances
			expect(await tokenA.balanceOf(user2.address)).to.equal(depositAmount);
			expect(await tokenB.balanceOf(user1.address)).to.equal(swapAmount);

			const order = await orderBasedSwap.ordersById(1);
			expect(order.isCompleted).to.be.true;
			expect(order.swapBy).to.equal(user2.address);
		});

		it("Should revert with custom error if Id less than 1", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1, user2 } =
				await loadFixture(deployFixture);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			// Create and complete an order
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);
			await tokenB.connect(user2).approve(orderBasedSwap, swapAmount);
			await expect(
				orderBasedSwap.connect(user2).swapToken(0)
			).to.be.revertedWithCustomError(orderBasedSwap, "InvalidOrderId");
		});

		it("Should revert with custom error if Id is greater than 1 but invalid", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1, user2 } =
				await loadFixture(deployFixture);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			// Create and complete an order
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);
			await tokenB.connect(user2).approve(orderBasedSwap, swapAmount);
			await expect(
				orderBasedSwap.connect(user2).swapToken(5)
			).to.be.revertedWithCustomError(orderBasedSwap, "InvalidOrderId");
		});

		it("Should revert when swapping an already completed order", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1, user2 } =
				await loadFixture(deployFixture);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			// Create and complete an order
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);
			await tokenB.connect(user2).approve(orderBasedSwap, swapAmount);
			await orderBasedSwap.connect(user2).swapToken(1);

			// Try to swap again
			await expect(
				orderBasedSwap.connect(user2).swapToken(1)
			).to.be.revertedWithCustomError(orderBasedSwap, "OrderAlreadyCompleted");
		});

		it("Should revert when swapping with insufficient funds", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1, user2 } =
				await loadFixture(deployFixture);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("2000");

			// Create order
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);

			// Try to swap
			await tokenB.connect(user2).approve(orderBasedSwap, swapAmount);
			await expect(
				orderBasedSwap.connect(user2).swapToken(1)
			).to.be.revertedWithCustomError(orderBasedSwap, "InsufficientFunds");
		});
	});

	describe("Order tracking", function () {
		it("Should correctly track all orders", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1 } = await loadFixture(
				deployFixture
			);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);
			expect(await orderBasedSwap.allOrders(0)).to.equal(1);

			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);

			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);

			expect(await orderBasedSwap.allOrders(1)).to.equal(2);
		});

		it("Should correctly track user orders", async function () {
			const { orderBasedSwap, tokenA, tokenB, user1 } = await loadFixture(
				deployFixture
			);
			const depositAmount = ethers.parseEther("100");
			const swapAmount = ethers.parseEther("200");

			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);
			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);
			await tokenA.connect(user1).approve(orderBasedSwap, depositAmount);

			await orderBasedSwap
				.connect(user1)
				.createOrder(tokenA, tokenB, depositAmount, swapAmount);

			expect(await orderBasedSwap.userOrders(user1.address, 0)).to.equal(1);
			expect(await orderBasedSwap.userOrders(user1.address, 1)).to.equal(2);
		});
	});
});
