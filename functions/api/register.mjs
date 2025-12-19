export async function onRequestPost({ env }) {
  const pk = env.PROOFY_PRIVATE_KEY || "";
  const looksLikePk =
    pk.startsWith("0x") &&
    pk.length === 66 &&
    /^0x[0-9a-fA-F]{64}$/.test(pk);

  const rpc = env.AMOY_RPC_URL || "";
  const looksLikeAmoyRpc = rpc.includes("polygon-amoy");

  return new Response(
    JSON.stringify({
      hasKey: !!pk,
      keyLooksValid: looksLikePk,
      hasRpc: !!rpc,
      rpcLooksAmoy: looksLikeAmoyRpc
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
