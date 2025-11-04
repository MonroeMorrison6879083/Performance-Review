module.exports = async function ({ getNamedAccounts, deployments, ethers }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy PerformanceReview contract with FHEVM support
  await deploy("PerformanceReview", {
    from: deployer,
    log: true,
    waitConfirmations: 1
  });
};

module.exports.tags = ["PerformanceReview"];


