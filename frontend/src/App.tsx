import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { loadSDK, createFhevmInstance, createDecryptionSignature, userDecryptBatch, encryptScores } from "./fhevm";
import contractInfo from "./contracts/PerformanceReview.json";

declare global {
  interface Window {
    ethereum?: any;
    relayerSDK?: any;
  }
}

type Handles = string[];

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#FFFFFF",
    padding: "40px 20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  },
  header: {
    maxWidth: "1000px",
    margin: "0 auto 60px",
    textAlign: "center" as const
  },
  title: {
    fontSize: "42px",
    fontWeight: "700" as const,
    color: "#003366",
    marginBottom: "16px",
    letterSpacing: "-0.5px"
  },
  subtitle: {
    fontSize: "18px",
    color: "#666666",
    fontWeight: "400" as const
  },
  mainContent: {
    maxWidth: "1000px",
    margin: "0 auto"
  },
  walletCard: {
    backgroundColor: "#F8FAFB",
    border: "2px solid #003366",
    borderRadius: "12px",
    padding: "24px 32px",
    marginBottom: "40px"
  },
  walletRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap" as const
  },
  walletItem: {
    flex: "1",
    minWidth: "200px"
  },
  walletLabel: {
    fontSize: "13px",
    color: "#666666",
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: "6px"
  },
  walletValue: {
    fontSize: "16px",
    color: "#003366",
    fontWeight: "600" as const,
    wordBreak: "break-all" as const
  },
  scoresSection: {
    backgroundColor: "#FFFFFF",
    border: "2px solid #E5E7EB",
    borderRadius: "12px",
    padding: "32px",
    marginBottom: "32px"
  },
  sectionTitle: {
    fontSize: "24px",
    fontWeight: "600" as const,
    color: "#003366",
    marginBottom: "24px"
  },
  scoresGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "24px"
  },
  scoreCard: {
    backgroundColor: "#F8FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: "8px",
    padding: "20px"
  },
  scoreLabel: {
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "#003366",
    marginBottom: "12px",
    display: "block"
  },
  scoreInput: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "16px",
    border: "2px solid #003366",
    borderRadius: "6px",
    backgroundColor: "#FFFFFF",
    color: "#003366",
    fontWeight: "600" as const,
    outline: "none",
    transition: "all 0.2s ease"
  },
  scoreDescription: {
    fontSize: "12px",
    color: "#666666",
    marginTop: "8px"
  },
  actionsSection: {
    display: "flex",
    gap: "16px",
    marginBottom: "32px",
    flexWrap: "wrap" as const
  },
  button: {
    flex: "1",
    minWidth: "200px",
    padding: "16px 32px",
    fontSize: "16px",
    fontWeight: "600" as const,
    color: "#FFFFFF",
    backgroundColor: "#003366",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textAlign: "center" as const
  },
  buttonDisabled: {
    backgroundColor: "#CCCCCC",
    cursor: "not-allowed"
  },
  statusSection: {
    backgroundColor: "#F8FAFB",
    border: "2px solid #003366",
    borderRadius: "12px",
    padding: "24px 32px",
    marginBottom: "24px"
  },
  statusLabel: {
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "#003366",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: "12px"
  },
  statusMessage: {
    fontSize: "16px",
    color: "#333333",
    lineHeight: "1.6",
    minHeight: "24px"
  },
  resultCard: {
    backgroundColor: "#E6F0F7",
    border: "2px solid #003366",
    borderRadius: "12px",
    padding: "24px 32px"
  },
  resultTitle: {
    fontSize: "18px",
    fontWeight: "600" as const,
    color: "#003366",
    marginBottom: "16px"
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px"
  },
  resultItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px"
  },
  resultLabel: {
    fontSize: "13px",
    color: "#666666",
    fontWeight: "600" as const
  },
  resultValue: {
    fontSize: "20px",
    color: "#003366",
    fontWeight: "700" as const
  },
  contractInfo: {
    textAlign: "center" as const,
    fontSize: "13px",
    color: "#999999",
    marginTop: "40px",
    padding: "16px"
  }
};

export default function App() {
  const [account, setAccount] = useState<string | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [provider, setProvider] = useState<ethers.BrowserProvider | undefined>(undefined);
  const [signer, setSigner] = useState<ethers.Signer | undefined>(undefined);

  const [fhevm, setFhevm] = useState<any | undefined>(undefined);

  const [exec, setExec] = useState<number>(80);
  const [team, setTeam] = useState<number>(85);
  const [task, setTask] = useState<number>(90);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [decryptLoading, setDecryptLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [decryptedResult, setDecryptedResult] = useState<{ total: string; pass: boolean } | null>(null);

  const contractReady = useMemo(() => {
    return Boolean(contractInfo?.abi?.length) && contractInfo?.address && contractInfo.address !== "0x0000000000000000000000000000000000000000";
  }, []);

  const contract = useMemo(() => {
    if (!signer || !contractInfo?.address || !contractInfo?.abi) return undefined;
    try {
      return new ethers.Contract(contractInfo.address, contractInfo.abi, signer);
    } catch {
      return undefined;
    }
  }, [signer]);

  useEffect(() => {
    const setup = async () => {
      if (!window.ethereum) {
        setMessage("Please install MetaMask wallet extension to use this application.");
        return;
      }
      const prov = new ethers.BrowserProvider(window.ethereum);
      setProvider(prov);
      const net = await prov.getNetwork();
      setChainId(Number(net.chainId));
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts?.[0]);
      const s = await prov.getSigner();
      setSigner(s);
      setMessage("Wallet connected successfully. Ready to submit performance review.");
    };
    setup().catch((e) => setMessage(`Failed to connect wallet: ${e?.message ?? "Unknown error occurred"}`));
  }, []);

  useEffect(() => {
    const initFhevm = async () => {
      if (!provider) return;
      try {
        await loadSDK();
        const instance = await createFhevmInstance(window.ethereum);
        setFhevm(instance);
        setMessage("FHEVM initialized. You can now submit encrypted scores.");
      } catch (e: any) {
        setMessage(`Failed to initialize encryption system: ${e?.message ?? "Unknown error occurred"}`);
      }
    };
    initFhevm();
  }, [provider]);

  const handleSubmit = async () => {
    if (!fhevm || !contract || !signer || !account) return;
    setSubmitLoading(true);
    setDecryptedResult(null);
    setMessage("Encrypting your performance scores locally...");
    try {
      const { handles, inputProof } = await encryptScores(fhevm, contract.getAddress ? await contract.getAddress() : contract.address, account, [exec, team, task]);

      setMessage("Submitting encrypted scores to blockchain...");
      const tx = await contract.submitEncryptedScores(handles[0], handles[1], handles[2], inputProof);
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx?.hash;
      setMessage(`Successfully submitted! Your scores have been encrypted and stored on-chain. Transaction: ${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`);
    } catch (e: any) {
      setMessage(`Submission failed: ${e?.message ?? "Unknown error occurred. Please try again."}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!fhevm || !contract || !signer) return;
    setDecryptLoading(true);
    setMessage("Retrieving encrypted results from blockchain...");
    try {
      const [totalHandle, passHandle]: Handles = await contract.getEncryptedResult();
      if (!totalHandle) {
        setMessage("No results available yet. Please submit your performance scores first.");
        setDecryptLoading(false);
        return;
      }

      setMessage("Generating decryption signature...");
      const sig = await createDecryptionSignature(fhevm, await contract.getAddress(), signer);
      if (!sig) {
        setMessage("Failed to generate decryption signature. Please try again.");
        setDecryptLoading(false);
        return;
      }
      setMessage("Decrypting your performance results...");
      const res = await userDecryptBatch(
        fhevm,
        await contract.getAddress(),
        [totalHandle, passHandle],
        sig
      );
      const total = res[totalHandle];
      const pass = res[passHandle];
      const passBool = typeof pass === "bigint" ? pass === 1n : Boolean(pass);
      setDecryptedResult({
        total: total?.toString?.() ?? total,
        pass: passBool
      });
      setMessage("Decryption completed successfully!");
    } catch (e: any) {
      setMessage(`Decryption failed: ${e?.message ?? "Unknown error occurred. Please try again."}`);
    } finally {
      setDecryptLoading(false);
    }
  };

  // Format Ethereum address for display
  const formatAddress = (addr: string) => {
    if (!addr) return "Not connected";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Performance Review System</h1>
        <p style={styles.subtitle}>Confidential performance evaluation powered by Fully Homomorphic Encryption</p>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.walletCard}>
          <div style={styles.walletRow}>
            <div style={styles.walletItem}>
              <div style={styles.walletLabel}>Wallet Address</div>
              <div style={styles.walletValue}>{formatAddress(account ?? "")}</div>
            </div>
            <div style={styles.walletItem}>
              <div style={styles.walletLabel}>Network Chain ID</div>
              <div style={styles.walletValue}>{chainId ?? "Not connected"}</div>
            </div>
            <div style={styles.walletItem}>
              <div style={styles.walletLabel}>Contract Network</div>
              <div style={styles.walletValue}>{contractInfo?.chainName ?? "Localhost"}</div>
            </div>
          </div>
        </div>

        <div style={styles.scoresSection}>
          <h2 style={styles.sectionTitle}>Performance Evaluation Scores</h2>
          <div style={styles.scoresGrid}>
            <div style={styles.scoreCard}>
              <label style={styles.scoreLabel}>Execution Ability</label>
              <input 
                type="number" 
                min={0} 
                max={100} 
                value={exec} 
                onChange={(e) => setExec(Number(e.target.value))}
                style={styles.scoreInput}
              />
              <div style={styles.scoreDescription}>Rate execution and delivery quality (0-100)</div>
            </div>
            <div style={styles.scoreCard}>
              <label style={styles.scoreLabel}>Teamwork Collaboration</label>
              <input 
                type="number" 
                min={0} 
                max={100} 
                value={team} 
                onChange={(e) => setTeam(Number(e.target.value))}
                style={styles.scoreInput}
              />
              <div style={styles.scoreDescription}>Rate collaboration and team contribution (0-100)</div>
            </div>
            <div style={styles.scoreCard}>
              <label style={styles.scoreLabel}>Task Completion Rate</label>
              <input 
                type="number" 
                min={0} 
                max={100} 
                value={task} 
                onChange={(e) => setTask(Number(e.target.value))}
                style={styles.scoreInput}
              />
              <div style={styles.scoreDescription}>Rate task completion and efficiency (0-100)</div>
            </div>
          </div>
        </div>

        <div style={styles.actionsSection}>
          <button 
            onClick={handleSubmit} 
            disabled={!fhevm || !contract || !contractReady || submitLoading}
            style={{
              ...styles.button,
              ...(!fhevm || !contract || !contractReady || submitLoading ? styles.buttonDisabled : {})
            }}
            onMouseOver={(e) => {
              if (fhevm && contract && contractReady && !submitLoading) {
                e.currentTarget.style.backgroundColor = "#004080";
              }
            }}
            onMouseOut={(e) => {
              if (fhevm && contract && contractReady && !submitLoading) {
                e.currentTarget.style.backgroundColor = "#003366";
              }
            }}
          >
            {submitLoading ? "Submitting..." : "Submit Encrypted Scores"}
          </button>
          <button 
            onClick={handleDecrypt} 
            disabled={!fhevm || !contract || !contractReady || decryptLoading}
            style={{
              ...styles.button,
              ...(!fhevm || !contract || !contractReady || decryptLoading ? styles.buttonDisabled : {})
            }}
            onMouseOver={(e) => {
              if (fhevm && contract && contractReady && !decryptLoading) {
                e.currentTarget.style.backgroundColor = "#004080";
              }
            }}
            onMouseOut={(e) => {
              if (fhevm && contract && contractReady && !decryptLoading) {
                e.currentTarget.style.backgroundColor = "#003366";
              }
            }}
          >
            {decryptLoading ? "Decrypting..." : "Decrypt Results"}
          </button>
        </div>

        <div style={styles.statusSection}>
          <div style={styles.statusLabel}>System Status</div>
          <div style={styles.statusMessage}>{message || "Ready to process your performance review."}</div>
        </div>

        {decryptedResult && (
          <div style={styles.resultCard}>
            <div style={styles.resultTitle}>Your Performance Review Results</div>
            <div style={styles.resultGrid}>
              <div style={styles.resultItem}>
                <div style={styles.resultLabel}>Total Weighted Score</div>
                <div style={styles.resultValue}>{decryptedResult.total}</div>
              </div>
              <div style={styles.resultItem}>
                <div style={styles.resultLabel}>Review Status</div>
                <div style={styles.resultValue}>
                  {decryptedResult.pass ? "✓ Passed" : "✗ Not Passed"}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={styles.contractInfo}>
          Contract Address: {contractInfo?.address ?? "Not deployed"}
        </div>
      </div>
    </div>
  );
}


