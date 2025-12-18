// functions/api/register.mjs
import { createPublicClient, createWalletClient, http, isHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function corsHeaders(env) {
  const allow = (env?.ALLOW_ORIGIN || process.env.ALLOW_ORIGIN || "*").trim() || "*";
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allow,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

function json(env, status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(env) });
}

function getEnv(context, key) {
  return (context?.env?.[key] || process.env[key] || "").trim();
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

function errorToText(e) {
  return String(e?.shortMessage || e?.message || e || "");
}

function looksLikeNotFoundOrRevert(msg) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("reverted") ||
    m.includes("execution reverted") ||
    m.includes("returned no data") ||
    m.includes("call exception") ||
    m.includes("no data")
  );
}

async function readExists(publicClient, contractAddress, abi, hash) {
  try {
    const res = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "getProof",
      args: [hash],
    });

    let ts, sub;
    if (Array.isArray(res)) {
      ts = Number(res[0] ?? 0);
      sub = res[1] ?? null;
    } else {
      ts = Number(res?.timestamp ?? 0);
      sub = res?.submitter ?? null;
    }

    const exists = ts > 0 && sub && sub !== zeroAddress;
    return {
      exists,
      timestamp: exists ? ts : 0,
      submitter: exists ? sub : null,
    };
  } catch (e) {
    const msg = errorToText(e);
    if (looksLikeNotFoundOrRevert(msg)) {
      return { exists: false, timestamp: 0, submitter: null };
    }
    throw e;
  }
}

export async function onRequest(context) {
  const { request } = context;

  try {
    if (request.method === "OPTIONS") return json(context.env, 204, {});
    if (request.method !== "POST") {
      return json(context.env, 405, { ok: false, userMessage: "Metoden stöds inte." });
    }

    const body = await request.json().catch(() => ({}));
    const hash = (body?.hash || "").trim();

    const CONTRACT_ADDRESS =
      getEnv(context, "CONTRACT_ADDRESS") ||
      getEnv(context, "PROOFY_CONTRACT_ADDRESS") ||
      getEnv(context, "VITE_PROOFY_CONTRACT_ADDRESS");

    const RPC_URL =
      getEnv(context, "AMOY_RPC_URL") ||
      getEnv(context, "POLYGON_AMOY_RPC_URL") ||
      getEnv(context, "RPC_URL");

    const PRIVATE_KEY =
      getEnv(context, "PROOFY_PRIVATE_KEY") ||
      getEnv(context, "PRIVATE_KEY");

    if (!isBytes32Hash(hash)) {
      return json(context.env, 400, { ok: false, userMessage: "Ogiltig hash. Välj fil igen och försök på nytt." });
    }

    if (!CONTRACT_ADDRESS || !isHex(CONTRACT_ADDRESS) || CONTRACT_ADDRESS.length !== 42) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Registreringstjänsten är inte korrekt konfigurerad just nu. Försök igen senare.",
      });
    }

    if (!RPC_URL || !(RPC_URL.startsWith("http://") || RPC_URL.startsWith("https://"))) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Registreringstjänsten är inte korrekt konfigurerad just nu. Försök igen senare.",
      });
    }

    if (!PRIVATE_KEY || !/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Registreringstjänsten är inte korrekt konfigurerad just nu. Försök igen senare.",
      });
    }

    const ABI = [
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
      // Vi testar vanliga skriv-funktioner. (Om ditt kontrakt använder annat namn måste vi veta det.)
      { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "registerHash", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "addProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
      { type: "function", name: "storeProof", stateMutability: "nonpayable", inputs: [{ name: "hash", type: "bytes32" }], outputs: [] },
    ];

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    // 1) Om redan registrerad: svara lugnt och tydligt
    const existing = await readExists(publicClient, CONTRACT_ADDRESS, ABI, hash);
    if (existing.exists) {
      return json(context.env, 200, {
        ok: true,
        alreadyExists: true,
        hashHex: hash,
        timestamp: existing.timestamp,
        submitter: existing.submitter,
      });
    }

    // 2) Skriv transaktion
    const account = privateKeyToAccount(PRIVATE_KEY);

    const walletClient = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(RPC_URL),
    });

    const candidates = ["register", "registerHash", "addProof", "storeProof"];

    let chosenFn = null;
    let sim = null;

    for (const fn of candidates) {
      try {
        sim = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: fn,
          args: [hash],
          account,
        });
        chosenFn = fn;
        break;
      } catch (e) {
        // prova nästa
      }
    }

    if (!chosenFn || !sim) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Registrering kan inte genomföras just nu. Kontraktets registreringsfunktion kunde inte bekräftas.",
        error: "No matching register function could be simulated. Check contract write function name/ABI.",
      });
    }

    const txHash = await walletClient.writeContract(sim.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return json(context.env, 200, {
      ok: true,
      alreadyExists: false,
      hashHex: hash,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      functionUsed: chosenFn,
    });
  } catch (e) {
    const msg = errorToText(e);

    // Om kontraktet revert:ar på write kan vi fortfarande ge ett lugnt besked (men logga msg i error-fältet)
    if (looksLikeNotFoundOrRevert(msg)) {
      return json(context.env, 500, {
        ok: false,
        userMessage: "Registreringen kunde inte genomföras just nu. Kontrollera att tjänstens konto har test-MATIC och försök igen.",
        error: msg,
      });
    }

    return json(context.env, 500, {
      ok: false,
      userMessage: "Registreringstjänsten är tillfälligt otillgänglig. Försök igen om en stund.",
      error: msg,
    });
  }
}
