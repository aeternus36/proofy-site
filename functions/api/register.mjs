export async function onRequest(context) {
  const { request, env } = context;

  // Tillåt endast POST
  if (request.method !== "POST") {
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
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // POST-logik
  const body = await request.json();

  return new Response(
    JSON.stringify({
      ok: true,
      received: body,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
