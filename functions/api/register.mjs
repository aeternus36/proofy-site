import { ethers } from "ethers";

export async function onRequestPost({ env }) {
  const res = {
    hasKey: !!env.PROOFY_PRIVATE_KEY,
    hasRpc: !!env.AMOY_RPC_URL,
    hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
  };

  try {
    if (!env.PROOFY_PRIVATE_KEY) throw new Error("Missing PROOFY_PRIVATE_KEY");
    const wallet = new ethers.Wallet(env.PROOFY_PRIVATE_KEY);
    res.signerAddress = wallet.address;
  } catch (e) {
    res.signerError = e.message;
  }

  return new Response(JSON.stringify(res, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
