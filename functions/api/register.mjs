export async function onRequestGet({ env }) {
  // GET används när du öppnar länken i webbläsaren.
  // Returnerar en tydlig status + vilka env som finns (utan att läcka hemligheter).
  const hasKey = Boolean(env.PROOFY_PRIVATE_KEY);
  const hasRpc = Boolean(env.AMOY_RPC_URL);
  const hasAddress = Boolean(env.PROOFY_CONTRACT_ADDRESS);

  return new Response(
    JSON.stringify(
      {
        ok: true,
        message: "Use POST /api/register",
        env: {
          hasKey,
          hasRpc,
          hasAddress,
        },
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function onRequestPost({ request, env }) {
  // POST används av Postman / din frontend.
  // Den här versionen är “säker debug” och bekräftar att POST funkar + att env finns.
  let body = null;

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify(
        { ok: false, error: "Invalid JSON body. Send Content-Type: application/json" },
        null,
        2
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const hasKey = Boolean(env.PROOFY_PRIVATE_KEY);
  const hasRpc = Boolean(env.AMOY_RPC_URL);
  const hasAddress = Boolean(env.PROOFY_CONTRACT_ADDRESS);

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
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
