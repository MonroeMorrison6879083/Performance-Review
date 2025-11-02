import { JsonRpcProvider, type Eip1193Provider } from "ethers";

// 默认本地 Hardhat RPC（与官方模板一致）
const LOCAL_RPC_BY_CHAINID: Record<number, string> = {
  31337: "http://localhost:8545",
};

async function getChainId(providerOrUrl: Eip1193Provider | string): Promise<number> {
  if (providerOrUrl == null) {
    throw new Error("providerOrUrl is required to determine chainId");
  }
  if (typeof providerOrUrl === "string") {
    const provider = new JsonRpcProvider(providerOrUrl);
    try {
      const net = await provider.getNetwork();
      return Number(net.chainId);
    } finally {
      provider.destroy();
    }
  }
  const request = (providerOrUrl as any)?.request;
  if (typeof request !== "function") {
    throw new Error("Invalid EIP-1193 provider: missing request function");
  }
  const hex = await request({ method: "eth_chainId" });
  if (typeof hex !== "string") {
    throw new Error("Invalid eth_chainId response");
  }
  return Number.parseInt(hex, 16);
}

async function getWeb3ClientVersion(rpcUrl: string): Promise<string> {
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const version = await provider.send("web3_clientVersion", []);
    if (typeof version !== "string") throw new Error("Invalid clientVersion");
    return version;
  } finally {
    provider.destroy();
  }
}

async function tryFetchFHEVMHardhatNodeRelayerMetadata(
  rpcUrl: string
): Promise<
  | {
      ACLAddress: `0x${string}`;
      InputVerifierAddress: `0x${string}`;
      KMSVerifierAddress: `0x${string}`;
    }
  | undefined
> {
  // 确认是 Hardhat 客户端
  const client = await getWeb3ClientVersion(rpcUrl);
  if (!client.toLowerCase().includes("hardhat")) {
    return undefined;
  }
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const metadata = await provider.send("fhevm_relayer_metadata", []);
    if (
      metadata &&
      typeof metadata === "object" &&
      typeof metadata.ACLAddress === "string" &&
      metadata.ACLAddress.startsWith("0x") &&
      typeof metadata.InputVerifierAddress === "string" &&
      metadata.InputVerifierAddress.startsWith("0x") &&
      typeof metadata.KMSVerifierAddress === "string" &&
      metadata.KMSVerifierAddress.startsWith("0x")
    ) {
      return metadata as {
        ACLAddress: `0x${string}`;
        InputVerifierAddress: `0x${string}`;
        KMSVerifierAddress: `0x${string}`;
      };
    }
    return undefined;
  } finally {
    provider.destroy();
  }
}

export async function loadSDK(): Promise<void> {
  if (typeof window === "undefined") return;
  if ("relayerSDK" in window && window.relayerSDK?.initSDK) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.umd.cjs";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Fallback to local copy
      const localScript = document.createElement("script");
      localScript.src = "/relayer-sdk-js.umd.cjs";
      localScript.async = true;
      localScript.onload = () => resolve();
      localScript.onerror = () => reject(new Error("Failed to load FHEVM Relayer SDK"));
      document.head.appendChild(localScript);
    };
    document.head.appendChild(script);
  });
}

/**
 * 完全仿照官方模板：
 * - 当鏈為 31337 時，先檢測是否為 FHEVM Hardhat 節點（fhevm_relayer_metadata）。
 *   - 若是，動態導入本地 mock 並建立 mock instance（避免 BAD_DATA）。
 *   - 若否，給出明確錯誤提示，要求啟動 FHEVM Hardhat 節點或切換到 Sepolia。
 * - 其他鏈走 CDN Relayer SDK 的 Sepolia 設定，但使用當前 provider 作為 network。
 */
export async function createFhevmInstance(providerOrUrl: Eip1193Provider | string): Promise<any> {
  const chainId = await getChainId(providerOrUrl);

  // 嘗試本地 31337 + FHEVM Hardhat Node
  const rpcUrl = LOCAL_RPC_BY_CHAINID[chainId];
  if (rpcUrl) {
    const metadata = await tryFetchFHEVMHardhatNodeRelayerMetadata(rpcUrl);
    if (metadata) {
      // 動態載入 mock，避免在生產包中包含整個 mock lib
      const mod = await import("./fhevmMock");
      return await mod.fhevmMockCreateInstance({
        rpcUrl,
        chainId,
        metadata,
      });
    } else {
      throw new Error(
        "Detected chainId=31337 but no FHEVM Hardhat node metadata found. " +
          "Please start Zama FHEVM Hardhat node or switch to Sepolia."
      );
    }
  }

  // 使用 CDN Relayer SDK（SepoliaConfig）建立實例
  if (!("relayerSDK" in window)) throw new Error("relayerSDK not available");
  const sdk = (window as any).relayerSDK;
  if (!sdk.__initialized__) {
    const ok = await sdk.initSDK();
    if (!ok) throw new Error("FHEVM SDK init failed");
    sdk.__initialized__ = true;
  }
  const config = { ...sdk.SepoliaConfig, network: providerOrUrl };
  const instance = await sdk.createInstance(config);
  return instance;
}

export async function encryptScores(instance: any, contractAddress: string, userAddress: string, scores: number[]) {
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  for (const s of scores) {
    input.add32(BigInt(Math.max(0, Math.min(100, Number(s) || 0))));
  }
  const enc = await input.encrypt();
  return enc as { handles: string[]; inputProof: string };
}

export type DecryptionSignature = {
  publicKey: string;
  privateKey: string;
  signature: string;
  contracts: `0x${string}`[];
  userAddress: `0x${string}`;
  startTimestamp: number;
  durationDays: number;
};

export async function createDecryptionSignature(instance: any, contractAddress: string, signer: any): Promise<DecryptionSignature | null> {
  try {
    const userAddress = (await signer.getAddress()) as `0x${string}`;
    const { publicKey, privateKey } = instance.generateKeypair();
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = 365;
    const eip712 = instance.createEIP712(publicKey, [contractAddress], startTimestamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );
    return {
      publicKey,
      privateKey,
      signature,
      contracts: [contractAddress as `0x${string}`],
      userAddress,
      startTimestamp,
      durationDays
    };
  } catch {
    return null;
  }
}

export async function userDecryptBatch(
  instance: any,
  contractAddress: string,
  handles: string[],
  sig: DecryptionSignature
): Promise<Record<string, bigint>> {
  const items = handles.map((h) => ({ handle: h, contractAddress }));
  const res = await instance.userDecrypt(
    items,
    sig.privateKey,
    sig.publicKey,
    sig.signature,
    sig.contracts,
    sig.userAddress,
    sig.startTimestamp,
    sig.durationDays
  );
  return res as Record<string, bigint>;
}


