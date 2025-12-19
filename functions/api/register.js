export async function onRequest(context) {
  const { request, env } = context;

  // ---- GET: används för browser-test ----
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Use POST /api/register",
        env: {
          hasKey: !!env.PROOFY_PRIVATE_KEY,
          hasRpc: !!env.AMOY_RPC_URL,
          hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
        },
      }, null, 2),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- POST: riktig endpoint ----
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { hash, filename } = body || {};

    if (!hash || !filename) {
      return new Response(
        JSON.stringify({ error: "hash and filename required" }),
        { status: 400 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        received: { hash, filename },
        env: {
          hasKey: !!env.PROOFY_PRIVATE_KEY,
          hasRpc: !!env.AMOY_RPC_URL,
          hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
        },
      }, null, 2),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- ALLT ANNAT ----
  return new Response("Method Not Allowed", { status: 405 });
}
