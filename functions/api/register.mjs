import { ethers } from "ethers";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const res = {
    hasKey: !!env.PROOFY_PRIVATE_KEY,
    hasRpc: !!env.AMOY_RPC_URL,
    hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
  };

  try {
    const wallet = new ethers.Wallet(env.PROOFY_PRIVATE_KEY);
    res.signerAddress = wallet.address;
  } catch (e) {
    res.signerError = e.message;
  }

  return new Response(JSON.stringify(res, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
