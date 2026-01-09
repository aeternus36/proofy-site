import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function isValidTxHash(tx){
  return typeof tx === "string" && tx.startsWith("0x") && tx.length === 66 && isHex(tx);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const tx = String(url.searchParams.get("tx") || "").trim();
  if (!isValidTxHash(tx)) return json(400, { ok:false, error:"Invalid tx" });

  const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
  if (!rpcUrl) return json(500, { ok:false, error:"Server misconfiguration" });

  try{
    const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl) });

    const receipt = await publicClient.getTransactionReceipt({ hash: tx }).catch(() => null);
    if (!receipt) return json(200, { ok:true, mined:false });

    return json(200, {
      ok:true,
      mined:true,
      status: receipt.status,              // "success" | "reverted"
      blockNumber: receipt.blockNumber?.toString?.() ?? null,
      to: receipt.to,
      from: receipt.from,
      transactionHash: receipt.transactionHash
    });
  }catch(e){
    return json(503, { ok:false, error:"Tx lookup failed", detail: String(e?.message||e).slice(0,400) });
  }
}
