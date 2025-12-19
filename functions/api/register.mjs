import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
  privateKeyToAccount,
  isHex,
} from "viem";
import { polygonAmoy } from "viem/chains";
import { ABI } from "./abi";

function json(statusCode, obj) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return json(204, {});
  if (request.method !== "POST") return json(405, { ok: false, error: "Use POST" });

  const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || "";
  const RPC_URL = env.AMOY_RPC_URL || "";
  const PRIVATE_KEY = env.PROOFY_PRIVATE_KEY || "";

  const body = await request.json().catch(() => ({}));
  const hash = (body?.hash || "").trim();

  if (!isBytes32Hash(hash)) {
    return json(400, { ok: false, error: "Invalid hash. Expected bytes32 hex." });
  }
  if (!CONTRACT_ADDRESS || !RPC_URL || !PRIVATE_KEY) {
    return json(500, { ok: false, error: "Missing env vars" });
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
    return json(400, { ok: false, error: "Invalid private key format." });
  }

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  try {
    const { timestamp, submitter } = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "getProof",
      args: [hash],
    });

    if (timestamp > 0 && submitter && submitter !== zeroAddress) {
      return json(200, {
        ok: true,
        alreadyExists: true,
        hashHex: hash,
        timestamp: Number(timestamp),
        submitter,
      });
    }
  } catch (_) {
    // ignore and continue to write
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  try {
    const { request: txRequest } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "register",
      args: [hash],
      account,
    });

    const txHash = await walletClient.writeContract(txRequest);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(200, {
      ok: true,
      alreadyExists: false,
      hashHex: hash,
      txHash,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    return json(500, { ok: false, error: msg });
  }
}
