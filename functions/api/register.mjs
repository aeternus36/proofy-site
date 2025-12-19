const BUILD_ID = "REGISTER-FP-001";

export async function onRequest({ request, env }) {
  // Svara alltid med något som bevisar att DU nått funktionen
  if (request.method === "GET") {
    return new Response(`GET OK ${BUILD_ID}`, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (request.method === "POST") {
    return new Response(
      JSON.stringify(
        {
          build: BUILD_ID,
          method: request.method,
          hasKey: !!env.PROOFY_PRIVATE_KEY,
          hasRpc: !!env.AMOY_RPC_URL,
          hasAddress: !!env.PROOFY_CONTRACT_ADDRESS,
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(`METHOD ${request.method} NOT ALLOWED ${BUILD_ID}`, { status: 405 });
}
