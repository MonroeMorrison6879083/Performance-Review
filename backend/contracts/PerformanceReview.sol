// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract PerformanceReview is ZamaEthereumConfig {
    // Performance data structure storing encrypted scores
    struct PerformanceData {
        euint32 exec;   // Encrypted execution score
        euint32 team;   // Encrypted teamwork score
        euint32 task;   // Encrypted task completion score
        euint32 total;  // Encrypted weighted total
        ebool pass;     // Encrypted pass flag
        bool exists;
    }

    address public owner;

    // Plaintext weights (sum must be 100)
    uint32 public weightExec; // e.g. 40
    uint32 public weightTeam; // e.g. 30
    uint32 public weightTask; // e.g. 30

    // Plaintext threshold (e.g. 75)
    uint32 public requiredScore;

    mapping(address => PerformanceData) private _records;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        weightExec = 40;
        weightTeam = 30;
        weightTask = 30;
        requiredScore = 75;
    }

    function setWeights(uint32 wExec, uint32 wTeam, uint32 wTask) external onlyOwner {
        require(wExec + wTeam + wTask == 100, "Invalid weights");
        weightExec = wExec;
        weightTeam = wTeam;
        weightTask = wTask;
    }

    function setRequiredScore(uint32 newRequired) external onlyOwner {
        require(newRequired <= 100, "Invalid threshold");
        requiredScore = newRequired;
    }

    // Submit three encrypted scores in one proof batch (created from the Relayer SDK buffer)
    function submitEncryptedScores(
        externalEuint32 encExec,
        externalEuint32 encTeam,
        externalEuint32 encTask,
        bytes calldata inputProof
    ) external {
        euint32 eExec = FHE.fromExternal(encExec, inputProof);
        euint32 eTeam = FHE.fromExternal(encTeam, inputProof);
        euint32 eTask = FHE.fromExternal(encTask, inputProof);

        // Store raw scores
        PerformanceData storage data = _records[msg.sender];
        data.exec = eExec;
        data.team = eTeam;
        data.task = eTask;
        data.exists = true;

        // Compute weighted total and pass flag
        (euint32 total, ebool passFlag) = _computeTotalAndPass(eExec, eTeam, eTask);
        data.total = total;
        data.pass = passFlag;

        // ACL: allow contract and sender to access the encrypted fields
        FHE.allowThis(data.exec);
        FHE.allowThis(data.team);
        FHE.allowThis(data.task);
        FHE.allowThis(data.total);
        FHE.allowThis(data.pass);

        FHE.allow(data.exec, msg.sender);
        FHE.allow(data.team, msg.sender);
        FHE.allow(data.task, msg.sender);
        FHE.allow(data.total, msg.sender);
        FHE.allow(data.pass, msg.sender);
    }

    // Recompute total and pass for the caller (e.g., after weights/threshold updates)
    function recompute() external {
        PerformanceData storage data = _records[msg.sender];
        require(data.exists, "No data");

        (euint32 total, ebool passFlag) = _computeTotalAndPass(data.exec, data.team, data.task);
        data.total = total;
        data.pass = passFlag;

        FHE.allowThis(data.total);
        FHE.allowThis(data.pass);
        FHE.allow(data.total, msg.sender);
        FHE.allow(data.pass, msg.sender);
    }

    // Return encrypted total and pass flag for the caller
    function getEncryptedResult() external view returns (euint32, ebool) {
        PerformanceData storage data = _records[msg.sender];
        require(data.exists, "No data");
        return (data.total, data.pass);
    }

    // Optionally return encrypted raw scores for the caller
    function getEncryptedScores() external view returns (euint32, euint32, euint32) {
        PerformanceData storage data = _records[msg.sender];
        require(data.exists, "No data");
        return (data.exec, data.team, data.task);
    }

    function _computeTotalAndPass(
        euint32 eExec,
        euint32 eTeam,
        euint32 eTask
    ) internal returns (euint32, ebool) {
        // total = (exec*weightExec + team*weightTeam + task*weightTask) / 100
        euint32 partExec = FHE.mul(eExec, weightExec);
        euint32 partTeam = FHE.mul(eTeam, weightTeam);
        euint32 partTask = FHE.mul(eTask, weightTask);

        euint32 sum = FHE.add(FHE.add(partExec, partTeam), partTask);
        euint32 total = FHE.div(sum, 100);

        ebool passFlag = FHE.ge(total, FHE.asEuint32(requiredScore));
        return (total, passFlag);
    }
}


