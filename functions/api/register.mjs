const BUILD_ID = "ENV-LIST-001";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const keys = Object.keys(env || {}).sort();

  return new Response(
    JSON.stringify(
      {
        build: BUILD_ID,
        keys,
        hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
        hasKey: !!env.PROOFY_PRIVATE_KEY,
        hasRpc: !!env.AMOY_RPC_URL
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
}
