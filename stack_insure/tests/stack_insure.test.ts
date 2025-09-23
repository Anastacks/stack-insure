
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const user1 = accounts.get("wallet_1")!;
const user2 = accounts.get("wallet_2")!;
const user3 = accounts.get("wallet_3")!;

const contractName = "stack_insure";

describe("Stack Insure Protocol", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Contract Setup & Admin Functions", () => {
    it("initializes with correct default values", () => {
      const stats = simnet.callReadOnlyFn(
        contractName,
        "get-contract-stats",
        [],
        deployer
      );
      expect(stats.result).toEqual(Cl.tuple({
        "total-pools": Cl.uint(0),
        "total-policies": Cl.uint(0), 
        "total-claims": Cl.uint(0),
        "protocol-fees": Cl.uint(0),
        "is-paused": Cl.bool(false)
      }));
    });

    it("allows owner to pause/unpause contract", () => {
      let result = simnet.callPublicFn(
        contractName,
        "pause-contract",
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const stats = simnet.callReadOnlyFn(
        contractName,
        "get-contract-stats",
        [],
        deployer
      );
      expect(stats.result).toEqual(Cl.tuple({
        "total-pools": Cl.uint(0),
        "total-policies": Cl.uint(0),
        "total-claims": Cl.uint(0), 
        "protocol-fees": Cl.uint(0),
        "is-paused": Cl.bool(true)
      }));

      result = simnet.callPublicFn(
        contractName,
        "unpause-contract",
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from pausing contract", () => {
      const result = simnet.callPublicFn(
        contractName,
        "pause-contract",
        [],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(401));
    });

    it("allows owner to set protocol fee rate", () => {
      const result = simnet.callPublicFn(
        contractName,
        "set-protocol-fee-rate",
        [Cl.uint(500)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("prevents setting invalid fee rate", () => {
      const result = simnet.callPublicFn(
        contractName,
        "set-protocol-fee-rate", 
        [Cl.uint(1001)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });
  });

  describe("Insurance Pool Management", () => {
    it("creates insurance pool successfully", () => {
      const result = simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Auto Insurance"), Cl.stringAscii("Coverage for vehicle damages"), Cl.uint(75)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(1));

      const poolInfo = simnet.callReadOnlyFn(
        contractName,
        "get-pool-info",
        [Cl.uint(1)],
        user1
      );
      expect(poolInfo.result).toBeSome(Cl.tuple({
        name: Cl.stringAscii("Auto Insurance"),
        description: Cl.stringAscii("Coverage for vehicle damages"),
        "total-staked": Cl.uint(0),
        "active-policies": Cl.uint(0),
        "risk-factor": Cl.uint(75),
        "created-at": Cl.uint(simnet.blockHeight),
        "is-active": Cl.bool(true)
      }));
    });

    it("prevents creating pool with invalid risk factor", () => {
      const result = simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Invalid Pool"), Cl.stringAscii("Test description"), Cl.uint(101)],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });

    it("prevents creating pool with empty name or description", () => {
      let result = simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii(""), Cl.stringAscii("Valid description"), Cl.uint(50)],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(402));

      result = simnet.callPublicFn(
        contractName,
        "create-insurance-pool", 
        [Cl.stringAscii("Valid Name"), Cl.stringAscii(""), Cl.uint(50)],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });

    it("allows staking in pool", () => {
      simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Test Pool"), Cl.stringAscii("Test Description"), Cl.uint(50)],
        user1
      );

      const stakeAmount = 50_000_000;
      const result = simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(stakeAmount)],
        user2
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const stakeInfo = simnet.callReadOnlyFn(
        contractName,
        "get-underwriter-stake",
        [Cl.standardPrincipal(user2), Cl.uint(1)],
        user2
      );
      expect(stakeInfo.result).toBeSome(Cl.tuple({
        "staked-amount": Cl.uint(stakeAmount),
        "staked-at": Cl.uint(simnet.blockHeight),
        "rewards-earned": Cl.uint(0),
        "is-active": Cl.bool(true)
      }));
    });

    it("prevents staking below minimum", () => {
      simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Test Pool"), Cl.stringAscii("Test Description"), Cl.uint(50)],
        user1
      );

      const result = simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(1000000)],
        user2
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });
  });
});
