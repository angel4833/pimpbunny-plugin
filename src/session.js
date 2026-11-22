// PimpBunny session support. Hedon Haven's host preserves response headers,
// so keep cookies between requests and send full browser headers.
const pimpBunnySession = { cookies: {} };

const PIMPBUNNY_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

function pimpBunnyCookieHeader() {
  return Object.keys(pimpBunnySession.cookies)
    .map((key) => `${key}=${pimpBunnySession.cookies[key]}`)
    .join("; ");
}

function pimpBunnyDefaultHeaders(extraHeaders = {}) {
  const headers = {
    "User-Agent": PIMPBUNNY_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://pimpbunny.com/",
    ...extraHeaders,
  };
  const cookie = pimpBunnyCookieHeader();
  if (cookie && !headers.Cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

function pimpBunnyRememberCookies(headers) {
  if (!headers) return;
  const raw = headers["set-cookie"] || headers["Set-Cookie"] || "";
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    if (!value) continue;
    const match = String(value).match(/^\s*([^=;]+)=([^;]*)/);
    if (match) pimpBunnySession.cookies[match[1]] = match[2];
  }
}

async function pimpBunnyRequest(url, headers = {}) {
  const requestHeaders = pimpBunnyDefaultHeaders(headers);
  const response = await httpRequest(url, requestHeaders);
  if (response && response.headers) {
    pimpBunnyRememberCookies(response.headers);
  }
  return response;
}
