/**
 * Cloudflare Pages Functions alias:
 *  - UI kan fortsätta anropa `/.netlify/functions/register`
 *  - Vi proxyar till din riktiga endpoint `/api/register`
 *
 * Ingen UI-ändring behövs.
 */
export async function onRequest({ request }) {
  // Bygg ny URL till /api/register men behåll origin + query
  const url = new URL(request.url);
  url.pathname = "/api/register";

  // Proxy vidare med samma method/headers/body
  // (Cloudflare tillåter att vi skickar vidare request.body som stream)
  const proxiedReq = new Request(url.toString(), request);

  return fetch(proxiedReq);
}
