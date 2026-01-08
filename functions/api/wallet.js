import { createPublicClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizePrivateKey(pk) {
  if (typeof pk !== "string") return "";
  const trimmed = pk.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    pk.startsWith("0x") &&
    pk.length === 66 &&
    isHex(pk)
  );
}

export async function onRequest({ env }) {
  try {
    const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
    const privateKey = normalizePrivateKey(env.PROOFY_PRIVATE_KEY);

    if (!rpcUrl) return json(500, { ok: false, error: "Missing AMOY_RPC_URL" });
    if (!isValidPrivateKeyHex(privateKey)) {
      return json(500, { ok: false, error: "Bad or missing PROOFY_PRIVATE_KEY" });
    }

    const account = privateKeyToAccount(privateKey);

    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const [chainId, balance] = await Promise.all([
      client.getChainId(),
      client.getBalance({ address: account.address }),
    ]);

    // Returnera i "MATIC" som flyttal (för enkel överblick)
    const balanceMatic = Number(balance) / 1e18;

    return json(200, {
      ok: true,
      chainId,
      address: account.address,
      balanceWei: balance.toString(),
      balanceMatic,
    });
  } catch (e) {
    const msg =
      (e && typeof e === "object" && "message" in e && e.message) || String(e);
    return json(500, { ok: false, error: String(msg).slice(0, 500) });
  }
}
