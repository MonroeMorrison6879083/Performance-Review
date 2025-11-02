## Performance Review dApp (FHEVM)

This project implements a privacy-preserving on-chain Performance Review system using Zama FHEVM. Employees submit encrypted scores (Execution, Teamwork, Task Rate), the contract computes an encrypted weighted total and an encrypted pass flag. Users can decrypt their own results client-side via the Relayer SDK and ACL-based signatures. The implementation follows the official FHEVM patterns:

- Contract uses `@fhevm/solidity` encrypted types (`euint32`, `ebool`) and handles external encrypted inputs with `externalEuint32` + `bytes proof` via `FHE.fromExternal`.
- All homomorphic math happens on-chain in ciphertext space (`FHE.add/mul/div/ge`).
- ACL is applied using `FHE.allow/allowThis` so users can decrypt their own data off-chain.
- Frontend uses the Relayer SDK UMD bundle to:
  - Create encrypted inputs (`createEncryptedInput → add32 → encrypt`)
  - Build an EIP‑712 user decryption signature
  - Perform `userDecrypt` to get clear values for the user

Directory layout:

- `PerformanceReview/backend`: Hardhat project with FHEVM plugin and a single contract `PerformanceReview.sol`
- `PerformanceReview/frontend`: Vite + React app that loads the Relayer SDK from CDN and implements encrypt/submit/decrypt UI

---

### 1) Prerequisites

- Node.js 18+ and npm/yarn
- MetaMask (or another EIP‑1193 provider) installed in your browser

---

### 2) Backend (Hardhat)

Install dependencies:

```bash
cd PerformanceReview/backend
npm install
```

#### Local Development

Run a local node:

```bash
npm run node
```

In a new terminal, compile and deploy:

```bash
cd PerformanceReview/backend
npm run compile
npm run deploy
```

Export ABI and address to the frontend:

```bash
npm run export-frontend
```

This writes `frontend/src/contracts/PerformanceReview.json`.

#### Deploy to Sepolia Testnet

To deploy to Sepolia testnet, you need to set up environment variables using PowerShell:

1. Set your Sepolia RPC URL and mnemonic:

```powershell
$env:SEPOLIA_RPC_URL = "https://your-sepolia-rpc-url.com"
$env:MNEMONIC = "your twelve word mnemonic phrase here"
```

2. Compile the contracts:

```powershell
cd backend
npm run compile
```

3. Deploy to Sepolia:

```powershell
npm run deploy:sepolia
```

4. Export ABI and address (automatically detects Sepolia deployment):

```powershell
npm run export-frontend
```

The export script will automatically:
- Detect all existing deployments (sepolia, localhost, hardhat)
- Merge addresses from all networks into the contract JSON file
- Include Sepolia (chainId: 11155111) address mapping
- Skip networks that don't have deployments

**Note**: Make sure your wallet has sufficient Sepolia ETH to pay for gas fees.

Notes on dependencies and versions (as required):
- `@fhevm/solidity: ^0.8.0`
- `@fhevm/hardhat-plugin: ^0.1.0`
- `hardhat-deploy: ^0.12.4`
- `@fhevm/mock-utils: 0.1.0` (included in devDependencies)

---

### 3) Frontend (Vite + React)

Install and start:

```bash
cd PerformanceReview/frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Connect MetaMask to the Hardhat local network (chainId `31337`).

The app UI lets you:
1. Enter three scores (0–100)
2. Submit encrypted scores (creates a single encrypted input with three `add32`s; sends handles + proof)
3. Decrypt your result (generates an EIP‑712 signature and calls `userDecrypt` with your ACL)

---

### 4) How it works (brief)

- Contract (`PerformanceReview.sol`):
  - Accepts three `externalEuint32` inputs plus a single `bytes inputProof` (from Relayer SDK `encrypt()`).
  - Converts them to internal encrypted types via `FHE.fromExternal`.
  - Computes: `total = (exec*wE + team*wT + task*wK) / 100` using `FHE.mul/add/div`.
  - Compares with plaintext threshold: `pass = FHE.ge(total, FHE.asEuint32(requiredScore))`.
  - Applies ACL: `FHE.allowThis(...)` and `FHE.allow(..., msg.sender)`.
  - Exposes `getEncryptedResult()` returning `(euint32 total, ebool pass)` handles.

- Frontend:
  - Loads Relayer SDK UMD (`https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs`) and runs `initSDK()`.
  - Creates a FHEVM instance with `SepoliaConfig` + `network: window.ethereum`.
  - Uses `createEncryptedInput(contractAddress, userAddress)` → `add32(x3)` → `encrypt()` to obtain `handles[]` + `inputProof`.
  - Calls `submitEncryptedScores(handles[0], handles[1], handles[2], inputProof)`.
  - Reads encrypted handles via `getEncryptedResult()`, then:
    - Builds EIP‑712 signature using `instance.createEIP712(...)` and `signer.signTypedData(...)`.
    - Calls `instance.userDecrypt([{ handle, contractAddress }, ...], ...)`.

This mirrors Zama’s official recommended integration and ACL-based decryption flow.

---

### 5) Troubleshooting

- If the frontend shows “deploy first”, ensure:
  1) Local node is running
  2) `npm run deploy` was executed
  3) `npm run export-frontend` wrote `frontend/src/contracts/PerformanceReview.json`
- If decryption fails, check ACL (the contract grants ACL on submit) and ensure you use the same account that submitted scores.
- Ensure MetaMask is connected to `localhost:8545` (chainId `31337`) and the selected account has funds (Hardhat provides funded accounts).

---

### 6) Security and Privacy Notes

- Only encrypted data is stored on-chain; plaintext is never stored or emitted.
- Users decrypt client-side with a time-bound EIP‑712 signature, aligned with Zama’s ACL model.
- Weights and threshold are plaintext for transparency; change them via owner functions and call `recompute()` for users as needed.


