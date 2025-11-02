require("dotenv").config();
require("@fhevm/hardhat-plugin");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
const { ethers } = require("ethers");

// Helper function to get accounts from mnemonic
function getAccountsFromMnemonic(mnemonic) {
  if (!mnemonic) return [];
  const accounts = [];
  // Generate accounts using the standard BIP44 path: m/44'/60'/0'/0/{index}
  // Use Wallet.fromPhrase with path to create each account directly
  for (let i = 0; i < 10; i++) {
    const wallet = ethers.Wallet.fromPhrase(mnemonic, `m/44'/60'/0'/0/${i}`);
    accounts.push(wallet.privateKey);
  }
  return accounts;
}

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  namedAccounts: {
    deployer: {
      default: 0,
      sepolia: 0
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.MNEMONIC ? getAccountsFromMnemonic(process.env.MNEMONIC) : [],
      gasPrice: "auto",
      timeout: 120000
    }
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
    deployments: "deployments"
  }
};


