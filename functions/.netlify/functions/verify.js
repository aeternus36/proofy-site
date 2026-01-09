/**
 * Cloudflare Pages Functions alias:
 *  - UI kan fortsätta anropa `/.netlify/functions/verify`
 *  - Vi proxyar till din riktiga endpoint `/api/verify`
 *
 * Ingen UI-ändring behövs.
 */
export async function onRequest({ request }) {
  const url = new URL(request.url);
  url.pathname = "/api/verify";

  const proxiedReq = new Request(url.toString(), request);
  return fetch(proxiedReq);
}
