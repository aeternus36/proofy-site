export async function onRequest({ request, env }) {
  const { method } = request;

  // Låt browser/klienter preflighta om du senare kör från frontend
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (method === "GET") {
    return new Response("register endpoint up", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (method === "POST") {
    let body;
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
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return new Response("Method Not Allowed", { status: 405 });
}
