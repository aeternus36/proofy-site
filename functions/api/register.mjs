export async function onRequestGet({ env }) {
  const hasKey = !!env.PROOFY_PRIVATE_KEY;
  const hasRpc = !!env.AMOY_RPC_URL;
  const hasAddress = !!env.PROOFY_CONTRACT_ADDRESS;

  return new Response(
    JSON.stringify(
      {
        ok: true,
        message: "Use POST /api/register",
        env: { hasKey, hasRpc, hasAddress },
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
}

export async function onRequestPost({ request, env }) {
  const hasKey = !!env.PROOFY_PRIVATE_KEY;
  const hasRpc = !!env.AMOY_RPC_URL;
  const hasAddress = !!env.PROOFY_CONTRACT_ADDRESS;

  let body = null;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Body must be valid JSON" }, null, 2),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        message: "POST received",
        received: body,
        env: { hasKey, hasRpc, hasAddress },
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
}
