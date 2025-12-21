import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

const PROOFY_ABI = [
  // Read: getProof(bytes32) -> (uint256 timestamp, address submitter)
  {
    type: "function",
    name: "getProof",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "submitter", type: "address" },
    ],
  },
  // Write: register(bytes32)
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
];

function json(status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

function isValidBytes32Hex(hash) {
  return (
    typeof hash === "string" &&
    hash.startsWith("0x") &&
    hash.length === 66 &&
    isHex(hash)
  );
}

function isValidAddressHex(addr) {
  return (
    typeof addr === "string" &&
    addr.startsWith("0x") &&
    addr.length === 42 &&
    isHex(addr)
  );
}

async function readProof({ publicClient, contractAddress, hash }) {
  const proof = await publicClient.readContract({
    address: contractAddress,
    abi: PROOFY_ABI,
    functionName: "getProof",
    args: [hash],
  });

  // viem tuple -> array
  const timestampBig = proof?.[0] ?? 0n;
  const submitter = proof?.[1] ?? "0x0000000000000000000000000000000000000000";

  const exists = BigInt(timestampBig) !== 0n;

  // Timestamp i sekunder: returnera Number om säkert, annars string (men vi kräver existens vid OK)
  const tsBig = BigInt(timestampBig);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);

  const timestamp =
    exists && tsBig <= maxSafe ? Number(tsBig) : exists ? tsBig.toString() : 0;

  return {
    exists,
    timestamp,
    submitter: exists
      ? submitter
      : "0x0000000000000000000000000000000000000000",
  };
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "content-type",
        "Cache-Control": "no-store",
      },
    });
  }

  // Allow GET for quick browser test
  if (request.method === "GET") {
    return json(200, {
      ok: true,
      message: "Use POST /api/register with JSON body: { hash: \"0x...\" }",
      env: {
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
      chain: { name: "polygonAmoy", chainId: polygonAmoy.id },
    });
  }

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Use POST" });
  }

  // 1) Read body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const hash = (body?.hash || "").trim();

  // 2) Validate hash (bytes32)
  if (!isValidBytes32Hex(hash)) {
    return json(400, {
      ok: false,
      error: "hash must be bytes32 (0x + 64 hex chars)",
      received: body,
    });
  }

  // 3) Env
  const rpcUrl = env.AMOY_RPC_URL;
  const contractAddress = env.PROOFY_CONTRACT_ADDRESS;
  const privateKey = env.PROOFY_PRIVATE_KEY;

  if (!rpcUrl || !contractAddress || !privateKey) {
    return json(500, {
      ok: false,
      error: "Missing environment variables",
      required: ["AMOY_RPC_URL", "PROOFY_CONTRACT_ADDRESS", "PROOFY_PRIVATE_KEY"],
    });
  }

  if (!isValidAddressHex(contractAddress)) {
    return json(500, {
      ok: false,
      error: "Invalid contract address format",
      expected: "0x + 40 hex chars",
    });
  }

  try {
    // 4) Clients
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const chainId = polygonAmoy.id;

    // 5) Pre-check: if already registered, return timestamp + submitter
    const pre = await readProof({ publicClient, contractAddress, hash });

    if (pre.exists) {
      // Här garanterar vi timestamp på 200
      if (!pre.timestamp || pre.timestamp === 0) {
        return json(500, {
          ok: false,
          error: "Inconsistent state: proof exists but timestamp is missing",
          chainId,
          hash,
        });
      }

      return json(200, {
        ok: true,
        chainId,
        hash,
        alreadyExists: true,
        timestamp: pre.timestamp,
        submitter: pre.submitter,
      });
    }

    // 6) Not registered -> send tx
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash],
    });

    // 7) Wait for confirmation (so we can return timestamp reliably)
    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    // 8) Read proof again (must exist now)
    const post = await readProof({ publicClient, contractAddress, hash });

    if (!post.exists || !post.timestamp || post.timestamp === 0) {
      return json(500, {
        ok: false,
        error: "Registration confirmation succeeded, but proof was not readable afterwards",
        chainId,
        hash,
        txHash,
      });
    }

    return json(200, {
      ok: true,
      chainId,
      hash,
      alreadyExists: false,
      txHash,
      timestamp: post.timestamp,
      submitter: post.submitter,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e?.message || String(e),
    });
  }
}
