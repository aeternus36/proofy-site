export async function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Use POST /api/register",
      env: {
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}

  return new Response(
    JSON.stringify({
      ok: true,
      received: body,
      env: {
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
