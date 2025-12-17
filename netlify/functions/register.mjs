import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

/**
 * ENV VARS som krävs i Netlify:
 * - AMOY_RPC_URL
 * - PROOFY_PRIVATE_KEY
 * - PROOFY_CONTRACT_ADDRESS
 */

export default async function handler(req) {
  try {
    // 1. Tillåt endast POST
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    // 2. Läs body
    const { hash } = JSON.parse(req.body || "{}");

    if (!hash || typeof hash !== "string" || !hash.startsWith("0x") || hash.length !== 66) {
      return json(400, {
        ok: false,
        error: "Invalid hash. Must be bytes32 hex (0x + 64 chars)"
      });
    }

    // 3. Läs och SANERA private key
    let pk = process.env.PROOFY_PRIVATE_KEY || "";
    pk = pk.trim();
    pk = pk.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");

    if (!pk.startsWith("0x")) pk = "0x" + pk;

    if (pk.length !== 66) {
      return json(500, {
        ok: false,
        error: `Invalid private key length (${pk.length}). Expected 66 incl 0x.`
      });
    }

    // 4. Läs övriga env vars
    const rpcUrl = process.env.AMOY_RPC_URL;
    const contractAddress = process.env.PROOFY_CONTRACT_ADDRESS;

    if (!rpcUrl || !contractAddress) {
      return json(500, {
        ok: false,
        error: "Missing AMOY_RPC_URL or PROOFY_CONTRACT_ADDRESS"
      });
    }

    // 5. Skapa konto + clients
    const account = privateKeyToAccount(pk);

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl)
    });

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(rpcUrl)
    });

    // 6. Kontrakts-ABI (MINIMAL & SÄKER)
    const abi = parseAbi([
      "function register(bytes32 hash)"
    ]);

    // 7. Skicka transaktion
    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: "register",
      args: [hash]
    });

    // 8. Vänta på kvitto
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash
    });

    return json(200, {
      ok: true,
      txHash,
      blockNumber: receipt.blockNumber
    });

  } catch (err) {
    return json(500, {
      ok: false,
      error: err.message || String(err)
    });
  }
}

/* ---------- helpers ---------- */
function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
