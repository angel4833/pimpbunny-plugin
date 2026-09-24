// PimpBunny session support. Hedon Haven's host preserves response headers,
// so keep cookies between requests like the official Pornhub implementation.
const pimpBunnySession = { cookies: {} };

function pimpBunnyCookieHeader() {
  return Object.keys(pimpBunnySession.cookies)
    .map((key) => `${key}=${pimpBunnySession.cookies[key]}`)
    .join("; ");
}

function pimpBunnyRememberCookies(headers) {
  if (!headers) return;
  const raw = headers["set-cookie"] || headers["Set-Cookie"] || "";
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    const match = String(value).match(/^\s*([^=;]+)=([^;]*)/);
    if (match) pimpBunnySession.cookies[match[1]] = match[2];
  }
}

async function pimpBunnyRequest(url, headers = {}) {
  const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://pimpbunny.com/",
    ...headers,
  };
  const cookie = pimpBunnyCookieHeader();
  if (cookie) requestHeaders.Cookie = cookie;
  const response = await httpRequest(url, requestHeaders);
  pimpBunnyRememberCookies(response.headers);
  return response;
}
