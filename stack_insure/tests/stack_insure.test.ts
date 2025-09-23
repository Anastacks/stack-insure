
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

    it("prevents unstaking due to transfer issue", () => {
      simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Test Pool"), Cl.stringAscii("Test Description"), Cl.uint(50)],
        user1
      );

      const stakeAmount = 50_000_000;
      simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(stakeAmount)],
        user2
      );

      const unstakeAmount = 20_000_000;
      const result = simnet.callPublicFn(
        contractName,
        "unstake-from-pool",
        [Cl.uint(1), Cl.uint(unstakeAmount)],
        user2
      );
      expect(result.result).toBeErr(Cl.uint(2));
    });
  });

  describe("Policy Management & Premium Calculations", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Auto Insurance"), Cl.stringAscii("Vehicle coverage"), Cl.uint(60)],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(100_000_000)],
        user2
      );
    });

    it("calculates premium correctly", () => {
      const premium = simnet.callReadOnlyFn(
        contractName,
        "calculate-policy-premium",
        [Cl.uint(10_000_000), Cl.uint(1000), Cl.uint(1)],
        user1
      );
      expect(premium.result).toBeOk(Cl.uint(1050));
    });

    it("prevents premium calculation for non-existent pool", () => {
      const premium = simnet.callReadOnlyFn(
        contractName,
        "calculate-policy-premium",
        [Cl.uint(10_000_000), Cl.uint(1000), Cl.uint(999)],
        user1
      );
      expect(premium.result).toBeErr(Cl.uint(410));
    });

    it("allows purchasing valid policy", () => {
      const coverageAmount = 50_000_000;
      const duration = 2000;
      
      const result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(coverageAmount), Cl.uint(duration)],
        user3
      );
      expect(result.result).toBeOk(Cl.uint(1));

      const policyInfo = simnet.callReadOnlyFn(
        contractName,
        "get-policy-info",
        [Cl.uint(1)],
        user3
      );
      expect(policyInfo.result).toBeSome(Cl.tuple({
        holder: Cl.standardPrincipal(user3),
        "pool-id": Cl.uint(1),
        "coverage-amount": Cl.uint(coverageAmount),
        "premium-paid": Cl.uint(7000),
        "start-block": Cl.uint(simnet.blockHeight),
        "end-block": Cl.uint(simnet.blockHeight + duration),
        "is-active": Cl.bool(true),
        "claims-made": Cl.uint(0)
      }));
    });

    it("prevents purchasing policy with invalid coverage amount", () => {
      let result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(500_000), Cl.uint(1000)],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(402));

      result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(2_000_000_000_000), Cl.uint(1000)],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });

    it("prevents purchasing policy with invalid duration", () => {
      let result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(10_000_000), Cl.uint(100)],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(409));

      result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(10_000_000), Cl.uint(60000)],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(409));
    });

    it("prevents purchasing policy exceeding pool coverage", () => {
      const result = simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(150_000_000), Cl.uint(1000)],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(408));
    });

    it("validates policy status correctly", () => {
      simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(10_000_000), Cl.uint(1000)],
        user3
      );

      let isValid = simnet.callReadOnlyFn(
        contractName,
        "is-policy-valid",
        [Cl.uint(1)],
        user3
      );
      expect(isValid.result).toBeBool(true);

      simnet.mineEmptyBlocks(1001);

      isValid = simnet.callReadOnlyFn(
        contractName,
        "is-policy-valid",
        [Cl.uint(1)],
        user3
      );
      expect(isValid.result).toBeBool(false);
    });

    it("calculates voting power correctly", () => {
      const votingPower = simnet.callReadOnlyFn(
        contractName,
        "get-voting-power-for-user",
        [Cl.standardPrincipal(user2), Cl.uint(1)],
        user2
      );
      expect(votingPower.result).toBeOk(Cl.uint(100));
    });

    it("returns zero voting power for non-stakers", () => {
      const votingPower = simnet.callReadOnlyFn(
        contractName,
        "get-voting-power-for-user",
        [Cl.standardPrincipal(user3), Cl.uint(1)],
        user3
      );
      expect(votingPower.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Claims Management & Voting", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-insurance-pool",
        [Cl.stringAscii("Health Insurance"), Cl.stringAscii("Medical coverage"), Cl.uint(45)],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(100_000_000)],
        user2
      );
      
      simnet.callPublicFn(
        contractName,
        "stake-in-pool",
        [Cl.uint(1), Cl.uint(50_000_000)],
        user1
      );

      simnet.callPublicFn(
        contractName,
        "purchase-policy",
        [Cl.uint(1), Cl.uint(20_000_000), Cl.uint(2000)],
        user3
      );
    });

    it("allows policy holder to submit claim", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Medical emergency claim")],
        user3
      );
      expect(result.result).toBeOk(Cl.uint(1));

      const claimInfo = simnet.callReadOnlyFn(
        contractName,
        "get-claim-info",
        [Cl.uint(1)],
        user3
      );
      expect(claimInfo.result).toBeSome(Cl.tuple({
        "policy-id": Cl.uint(1),
        claimant: Cl.standardPrincipal(user3),
        amount: Cl.uint(5_000_000),
        description: Cl.stringAscii("Medical emergency claim"),
        "submitted-at": Cl.uint(simnet.blockHeight),
        status: Cl.stringAscii("pending"),
        "votes-for": Cl.uint(0),
        "votes-against": Cl.uint(0),
        "voting-ends-at": Cl.uint(simnet.blockHeight + 1008)
      }));
    });

    it("prevents non-policy-holder from submitting claim", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Fraudulent claim")],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(401));
    });

    it("prevents claim exceeding coverage amount", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(25_000_000), Cl.stringAscii("Excessive claim")],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });

    it("prevents claim with empty description", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("")],
        user3
      );
      expect(result.result).toBeErr(Cl.uint(402));
    });

    it("allows stakers to vote on claims", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Valid medical claim")],
        user3
      );

      const voteResult = simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user2
      );
      expect(voteResult.result).toBeOk(Cl.bool(true));

      const claimInfo = simnet.callReadOnlyFn(
        contractName,
        "get-claim-info",
        [Cl.uint(1)],
        user2
      );
      expect(claimInfo.result).toBeSome(Cl.tuple({
        "policy-id": Cl.uint(1),
        claimant: Cl.standardPrincipal(user3),
        amount: Cl.uint(5_000_000),
        description: Cl.stringAscii("Valid medical claim"),
        "submitted-at": Cl.uint(simnet.blockHeight - 1),
        status: Cl.stringAscii("pending"),
        "votes-for": Cl.uint(100),
        "votes-against": Cl.uint(0),
        "voting-ends-at": Cl.uint(simnet.blockHeight - 1 + 1008)
      }));
    });

    it("prevents double voting on claims", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Valid claim")],
        user3
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user2
      );

      const doubleVote = simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(false)],
        user2
      );
      expect(doubleVote.result).toBeErr(Cl.uint(407));
    });

    it("prevents non-stakers from voting", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Valid claim")],
        user3
      );

      const voteResult = simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user3
      );
      expect(voteResult.result).toBeErr(Cl.uint(401));
    });

    it("processes approved claims correctly", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Approved claim")],
        user3
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user2
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user1
      );

      simnet.mineEmptyBlocks(1009);

      const processResult = simnet.callPublicFn(
        contractName,
        "process-claim",
        [Cl.uint(1)],
        deployer
      );
      expect(processResult.result).toBeOk(Cl.stringAscii("approved"));
    });

    it("processes rejected claims correctly", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Rejected claim")],
        user3
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(false)],
        user2
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(false)],
        user1
      );

      simnet.mineEmptyBlocks(1009);

      const processResult = simnet.callPublicFn(
        contractName,
        "process-claim",
        [Cl.uint(1)],
        deployer
      );
      expect(processResult.result).toBeOk(Cl.stringAscii("rejected"));
    });

    it("prevents processing claims before voting period ends", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Early process claim")],
        user3
      );

      const processResult = simnet.callPublicFn(
        contractName,
        "process-claim",
        [Cl.uint(1)],
        deployer
      );
      expect(processResult.result).toBeErr(Cl.uint(406));
    });

    it("prevents voting after voting period ends", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Late vote claim")],
        user3
      );

      simnet.mineEmptyBlocks(1009);

      const voteResult = simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user2
      );
      expect(voteResult.result).toBeErr(Cl.uint(405));
    });

    it("prevents reprocessing already processed claims", () => {
      simnet.callPublicFn(
        contractName,
        "submit-claim",
        [Cl.uint(1), Cl.uint(5_000_000), Cl.stringAscii("Processed claim")],
        user3
      );

      simnet.callPublicFn(
        contractName,
        "vote-on-claim",
        [Cl.uint(1), Cl.bool(true)],
        user2
      );

      simnet.mineEmptyBlocks(1009);

      simnet.callPublicFn(
        contractName,
        "process-claim",
        [Cl.uint(1)],
        deployer
      );

      const reprocessResult = simnet.callPublicFn(
        contractName,
        "process-claim",
        [Cl.uint(1)],
        deployer
      );
      expect(reprocessResult.result).toBeErr(Cl.uint(407));
    });
  });
});
