export async function onRequestPost({ request, env }) {
  const body = await request.json();

  return new Response(
    JSON.stringify({
      ok: true,
      received: body,
      hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      hasKey: !!env.PROOFY_PRIVATE_KEY,
      hasRpc: !!env.AMOY_RPC_URL
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
