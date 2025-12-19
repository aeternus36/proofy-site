export async function onRequestGet() {
  return new Response("REGISTER_FUNCTION_OK", {
    headers: { "Content-Type": "text/plain" },
  });
}
