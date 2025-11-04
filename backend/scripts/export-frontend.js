const fs = require("fs");
const path = require("path");

function readDeployment(networkName) {
  const p = path.join(__dirname, "..", "deployments", networkName, "PerformanceReview.json");
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  }
  return null;
}

function getAllDeployments() {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    return [];
  }
  
  const networks = fs.readdirSync(deploymentsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  const deployments = [];
  for (const network of networks) {
    const dep = readDeployment(network);
    if (dep) {
      deployments.push({ network, deployment: dep });
    }
  }
  return deployments;
}

function main() {
  // Get all existing deployments across networks
  const allDeployments = getAllDeployments();
  
  if (allDeployments.length === 0) {
    console.log("No deployment found. Skipping export.");
    return;
  }

  const outDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "PerformanceReview.json");

  // Build address mapping for all chain IDs
  const addresses = {};
  let primaryDep = null;
  let primaryNetwork = null;
  
  // Priority order: sepolia > localhost > hardhat > others
  const priority = ["sepolia", "localhost", "hardhat"];
  
  // First, find primary deployment (for backward compatibility)
  for (const priorityNet of priority) {
    const found = allDeployments.find(d => d.network === priorityNet);
    if (found) {
      primaryDep = found.deployment;
      primaryNetwork = found.network;
      break;
    }
  }
  
  // If no priority network found, use the first one
  if (!primaryDep && allDeployments.length > 0) {
    primaryDep = allDeployments[0].deployment;
    primaryNetwork = allDeployments[0].network;
  }

  // Collect addresses from all deployments
  for (const { network, deployment } of allDeployments) {
    let chainId = deployment.network?.chainId;
    
    // Fallback chain ID mapping for known networks
    if (!chainId) {
      if (network === "sepolia") {
        chainId = 11155111;
      } else if (network === "localhost" || network === "hardhat") {
        chainId = 31337;
      }
    }
    
    if (chainId) {
      addresses[chainId.toString()] = deployment.address;
      console.log(`Found deployment on ${network} (chainId: ${chainId}) at ${deployment.address}`);
    }
  }

  // Try to read existing file to preserve other chain addresses
  if (fs.existsSync(outPath)) {
    try {
      const existingPayload = JSON.parse(fs.readFileSync(outPath, "utf8"));
      if (existingPayload.addresses && typeof existingPayload.addresses === "object") {
        // Merge existing addresses (existing takes precedence for conflicts)
        Object.assign(existingPayload.addresses, addresses);
        Object.assign(addresses, existingPayload.addresses);
      }
    } catch (e) {
      console.log("Could not read existing contract file, creating new one");
    }
  }

  const primaryChainId = primaryDep?.network?.chainId || 
    (primaryNetwork === "sepolia" ? 11155111 : 
     (primaryNetwork === "localhost" || primaryNetwork === "hardhat" ? 31337 : null));

  const payload = {
    address: primaryDep?.address || "", // Keep for backward compatibility
    addresses: addresses, // New format with chain ID mapping
    chainId: primaryChainId || Object.keys(addresses)[0] || null,
    chainName: primaryDep?.network?.name || primaryNetwork || "unknown",
    abi: primaryDep?.abi || []
  };

  // Ensure Sepolia (11155111) address is explicitly included if available
  const sepoliaDep = allDeployments.find(d => d.network === "sepolia");
  if (sepoliaDep) {
    addresses["11155111"] = sepoliaDep.deployment.address;
    payload.addresses = addresses;
  }

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Exported contract information for ${allDeployments.length} network(s)`);
  console.log(`Primary network: ${primaryNetwork} (chainId: ${payload.chainId})`);
  console.log(`Wrote ${outPath}`);
}

main();


