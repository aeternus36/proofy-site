import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Minimal ABI: vi antar att kontraktet har en funktion: register(string hash, string filename)
// Om din contract-function heter något annat (t.ex. registerProof), byt bara "register" nedan.
const PROOFY_ABI = [
  {
    "type": "function",
    "name": "register",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "hash", "type": "string" },
      { "name": "filename", "type": "string" }
    ],
    "outputs": []
  }
];

function json(status, obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

function cleanPrivateKey(pk) {
  if (!pk) return "";
  const trimmed = pk.trim();
  // måste vara 0x + 64 hex
  if (!trimmed.startsWith("0x")) return "0x" + trimmed;
  return trimmed;
}

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // GET: visa debug (så du slipper “Method Not Allowed” i browser)
  if (request.method === "GET") {
    return json(200, {
      ok: true,
      message: "Use POST /api/register",
      env: {
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
    });
  }

  // Bara POST får registrera
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method Not Allowed. Use POST." });
  }

  // 1) Läs body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "Body must be valid JSON" });
  }

  const hash = (body?.hash ?? "").toString().trim();
  const filename = (body?.filename ?? "").toString().trim();

  if (!hash || !filename) {
    return json(400, {
      ok: false,
      error: "Missing fields. Required: { hash, filename }",
      received: body ?? null,
    });
  }

  // 2) Läs env
  const rpcUrl = (env.AMOY_RPC_URL ?? "").trim();
  const contractAddress = (env.PROOFY_CONTRACT_ADDRESS ?? "").trim();
  const pkRaw = env.PROOFY_PRIVATE_KEY ?? "";
  const privateKey = cleanPrivateKey(pkRaw);

  const envCheck = {
    hasKey: !!privateKey,
    hasRpc: !!rpcUrl,
    hasAddress: !!contractAddress,
    keyLooksValid: privateKey.startsWith("0x") && privateKey.length === 66 && isHex(privateKey),
  };

  if (!envCheck.hasRpc || !envCheck.hasAddress || !envCheck.hasKey) {
    return json(500, {
      ok: false,
      error: "Missing secrets in environment",
      env: envCheck,
    });
  }

  if (!envCheck.keyLooksValid) {
    return json(500, {
      ok: false,
      error: "PROOFY_PRIVATE_KEY looks invalid. Must be 0x + 64 hex characters.",
      env: envCheck,
    });
  }

  // 3) Skapa client + gör tx
  try {
    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    // (Valfritt men bra) kolla att RPC svarar
    const chainId = await publicClient.getChainId();

    // Skicka tx: register(hash, filename)
    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: PROOFY_ABI,
      functionName: "register",
      args: [hash, filename],
    });

    return json(200, {
      ok: true,
      chainId,
      txHash,
      received: { hash, filename },
      env: envCheck,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e?.message ?? String(e),
      hint:
        "Om felet säger 'function selector was not recognized' eller liknande: din contract-function heter inte 'register' eller har andra param-typer. Då måste vi ändra ABI/functionName.",
    });
  }
}
