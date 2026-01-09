function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequest() {
  return json(405, {
    ok: false,
    error: "Method Not Allowed",
    hint: "Use POST /api/register with JSON body: {\"hash\":\"0x...bytes32\"}",
  });
}
