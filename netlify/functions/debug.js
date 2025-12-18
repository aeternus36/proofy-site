export async function onRequestGet({ env }) {
  const contractAddress =
    env.CONTRACT_ADDRESS ||
    env.PROOFY_CONTRACT_ADDRESS ||
    "";

  const rpcUrl =
    env.AMOY_RPC_URL ||
    env.RPC_URL ||
    "";

  const chainId =
    env.CHAIN_ID || "";

  const allowOrigin =
    env.ALLOW_ORIGIN || "";

  return new Response(JSON.stringify({
    ok: true,
    hasContractAddress: !!contractAddress,
    hasRpcUrl: !!rpcUrl,
    hasChainId: !!chainId,
    hasAllowOrigin: !!allowOrigin,
    contractAddressLooksValid: /^0x[a-fA-F0-9]{40}$/.test(contractAddress),
    rpcUrlStartsWithHttps: /^https:\/\//.test(rpcUrl),
    // OBS: vi returnerar INTE nycklar/privata värden
    // bara boolean/format-checkar
  }, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    }
  });
}
