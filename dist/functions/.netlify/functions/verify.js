export async function onRequest({ request }) {
  const url = new URL(request.url);
  url.pathname = "/api/verify";
  return fetch(new Request(url.toString(), request));
}
