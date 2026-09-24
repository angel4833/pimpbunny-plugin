// PimpBunny request/session helpers.
const pimpBunnySession = { cookies: {} };

function cookieHeader() {
  return Object.keys(pimpBunnySession.cookies)
    .map((key) => `${key}=${pimpBunnySession.cookies[key]}`)
    .join("; ");
}

function rememberCookies(headers) {
  if (!headers) return;
  const setCookie = headers["set-cookie"] || headers["Set-Cookie"] || "";
  if (!setCookie) return;
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  values.forEach((value) => {
    String(value).split(/,(?=[^;,=]+=[^;,]+)/).forEach((item) => {
      const match = item.trim().match(/^([^=;]+)=([^;]*)/);
      if (match && match[1]) pimpBunnySession.cookies[match[1]] = match[2];
    });
  });
}

async function pimpBunnyRequest(url, extraHeaders = {}) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://pimpbunny.com/",
    ...extraHeaders,
  };
  const cookies = cookieHeader();
  if (cookies) headers.Cookie = cookies;
  const response = await httpRequest(url, headers);
  rememberCookies(response.headers);
  return response;
}
