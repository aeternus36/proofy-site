import { createPublicClient, createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function isBytes32Hash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h);
}

export async function onRequestOptions() {
  return json({}, 204);
}

export async function onRequestPost({ request, env }) {
  try {
    const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || env.PROOFY_CONTRACT_ADDRESS;
    const RPC_URL = env.AMOY_RPC_URL;
    const PRIVATE_KEY = env.PROOFY_PRIVATE_KEY;

    if (!CONTRACT_ADDRESS) return json({ ok: false, error: "Missing CONTRACT_ADDRESS" }, 400);
    if (!RPC_URL) return json({ ok: false, error: "Missing AMOY_RPC_URL" }, 400);
    if (!PRIVATE_KEY) return json({ ok: false, error: "Missing PROOFY_PRIVATE_KEY" }, 400);

    const body = await request.json().catch(() => ({}));
    const hash = String(body.hash || "").trim();
    if (!isBytes32Hash(hash)) return json({ ok: false, error: "Invalid hash. Expected bytes32 (0x + 64 hex)." }, 400);

    const account = privateKeyToAccount(PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ chain: polygonAmoy, transport: http(RPC_URL), account });

    const FN_CANDIDATES = ["register", "registerHash", "submitHash", "storeHash"];

    let lastErr = null;

    for (const fn of FN_CANDIDATES) {
      const ABI = [{
        type: "function",
        name: fn,
        stateMutability: "nonpayable",
        inputs: [{ name: "hash", type: "bytes32" }],
        outputs: [],
      }];

      try {
        // simulate först för att få request korrekt
        const sim = await publicClient.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: fn,
          args: [hash],
          account,
        });

        const txHash = await walletClient.writeContract(sim.request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return json({
          ok: true,
          hashHex: hash,
          txHash,
          status: receipt.status,
          blockNumber: Number(receipt.blockNumber),
        }, 200);

      } catch (e) {
        lastErr = e;
      }
    }

    const msg = String(lastErr?.shortMessage || lastErr?.message || lastErr || "Register failed");
    return json({ ok: false, error: msg }, 502);

  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "Use POST" }, 405);
}

