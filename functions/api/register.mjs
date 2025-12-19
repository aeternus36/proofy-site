export async function onRequestGet() {
  return new Response("register endpoint up", {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function onRequestPost({ request, env }) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      received: body,
      hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
      hasKey: !!env.PROOFY_PRIVATE_KEY,
      hasRpc: !!env.AMOY_RPC_URL,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
