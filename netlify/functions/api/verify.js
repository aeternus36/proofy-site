import { createPublicClient, http, isHex, zeroAddress } from "viem";
import { polygonAmoy } from "viem/chains";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
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

export async function onRequestGet({ request, env }) {
  try {
    const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || env.PROOFY_CONTRACT_ADDRESS;
    const RPC_URL = env.AMOY_RPC_URL;

    // Miljö saknas → detta är enda fallet vi "felar" hårt
    if (!CONTRACT_ADDRESS) return json({ ok: false, error: "Missing CONTRACT_ADDRESS" }, 400);
    if (!RPC_URL) return json({ ok: false, error: "Missing AMOY_RPC_URL" }, 400);

    const url = new URL(request.url);
    const hash = url.searchParams.get("hash") || "";

    if (!isBytes32Hash(hash)) {
      return json({ ok: false, error: "Invalid hash. Expected bytes32 (0x + 64 hex)." }, 400);
    }

    const client = createPublicClient({ chain: polygonAmoy, transport: http(RPC_URL) });

    // Vi testar flera funktionsnamn för robusthet (om kontraktet skiljer sig)
    const ABI_CANDIDATES = [
      { name: "getProof", outputs: [{ name: "timestamp", type: "uint256" }, { name: "submitter", type: "address" }] },
      { name: "proofs", outputs: [{ name: "timestamp", type: "uint256" }, { name: "submitter", type: "address" }] },
      { name: "getRecord", outputs: [{ name: "timestamp", type: "uint256" }, { name: "submitter", type: "address" }] },
    ];

    let timestamp = 0;
    let submitter = null;
    let found = false;

    for (const cand of ABI_CANDIDATES) {
      const ABI = [{
        type: "function",
        name: cand.name,
        stateMutability: "view",
        inputs: [{ name: "hash", type: "bytes32" }],
        outputs: cand.outputs,
      }];

      try {
        const res = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: cand.name,
          args: [hash],
        });

        // viem kan returnera array eller object beroende på version
        if (Array.isArray(res)) {
          timestamp = Number(res[0] || 0);
          submitter = res[1] || null;
        } else if (res && typeof res === "object") {
          timestamp = Number(res.timestamp || 0);
          submitter = res.submitter || null;
        } else {
          timestamp = 0;
          submitter = null;
        }

        // Om kontraktet representerar "saknas" som 0/zeroAddress
        if (timestamp > 0 && submitter && isHex(submitter) && submitter !== zeroAddress) {
          found = true;
        } else {
          found = false;
          timestamp = 0;
          submitter = null;
        }

        return json({
          ok: true,
          hashHex: hash,
          exists: found,
          timestamp: found ? timestamp : 0,
          submitter: found ? submitter : null,
        }, 200);

      } catch (e) {
        // Här gör vi det användarvänligt:
        // - om funktionen inte finns / revert / no data -> prova nästa kandidat
        // - om allt failar -> returnera exists:false istället för "tekniskt fel"
        const msg = String(e?.shortMessage || e?.message || e);
        const looksLikeMissingFn =
          msg.includes("returned no data") ||
          msg.includes("reverted") ||
          msg.toLowerCase().includes("execution reverted");

        if (!looksLikeMissingFn) {
          // okända fel i läsning -> vi vill fortfarande inte skrämma
          // men vi provar nästa kandidat ändå
        }
      }
    }

    // Inget funktionsnamn fungerade → behandla som "ej registrerad"
    return json({
      ok: true,
      hashHex: hash,
      exists: false,
      timestamp: 0,
      submitter: null,
    }, 200);

  } catch (e) {
    // Sista skyddet: fortfarande ingen "tekniskt fel"-bomb för användaren
    return json({ ok: true, exists: false }, 200);
  }
}

