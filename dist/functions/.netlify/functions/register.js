export async function onRequest({ request }) {
  const url = new URL(request.url);
  url.pathname = "/api/register";
  return fetch(new Request(url.toString(), request));
}
