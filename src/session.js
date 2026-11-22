// PimpBunny session and cross-version Hedon Haven HTTP response normalization.
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

function pimpBunnyDecodeBase64Bytes(base64Str) {
  const clean = String(base64Str || "").replace(/[^A-Za-z0-9+/=]/g, "");
  if (!clean) return [];
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = table.indexOf(clean[i]);
    const c2 = table.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === "=" ? -1 : table.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === "=" ? -1 : table.indexOf(clean[i + 3]);
    if (c1 < 0 || c2 < 0) continue;
    bytes.push((c1 << 2) | (c2 >> 4));
    if (c3 >= 0) bytes.push(((c2 & 15) << 4) | (c3 >> 2));
    if (c4 >= 0) bytes.push(((c3 & 3) << 6) | c4);
  }
  return bytes;
}

function pimpBunnyBytesToUtf8(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
    } else if (b1 >= 0xc0 && b1 < 0xe0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if (b1 >= 0xe0 && b1 < 0xf0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if (b1 >= 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      const cp = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function pimpBunnyDecodeBase64Utf8(base64Str) {
  if (!base64Str) return "";
  return pimpBunnyBytesToUtf8(pimpBunnyDecodeBase64Bytes(base64Str));
}

function pimpBunnyNormalizeResponse(response, options = {}) {
  if (!response || typeof response !== "object") {
    return {
      statusCode: 0,
      status: 0,
      headers: {},
      body: "",
      bodyBytes: [],
      rawBodyBase64: "",
      isLegacyBase64Host: false,
    };
  }

  // Legacy Hedon Haven (<=0.6.x) returns { status, body: base64String } without statusCode/bodyBytes.
  // Newer Hedon Haven (>=0.6.7) returns { statusCode, bodyBytes: int[], body: utf8String, headers }.
  const isLegacyBase64Host =
    typeof response.statusCode === "undefined" &&
    typeof response.status !== "undefined" &&
    !Array.isArray(response.bodyBytes);

  const statusCode = Number(response.statusCode ?? response.status ?? 0);

  if (isLegacyBase64Host) {
    const rawBodyBase64 = typeof response.body === "string" ? response.body : "";
    const decodedBody = options.binary ? "" : pimpBunnyDecodeBase64Utf8(rawBodyBase64);
    return {
      statusCode,
      status: statusCode,
      headers: response.headers || {},
      body: decodedBody,
      bodyBytes: [],
      rawBodyBase64,
      isLegacyBase64Host: true,
    };
  }

  return {
    statusCode,
    status: statusCode,
    headers: response.headers || {},
    body: typeof response.body === "string" ? response.body : "",
    bodyBytes: Array.isArray(response.bodyBytes)
      ? response.bodyBytes
      : response.bodyBytes
      ? Array.from(response.bodyBytes)
      : [],
    rawBodyBase64: "",
    isLegacyBase64Host: false,
  };
}

async function pimpBunnyRequest(url, headers = {}, options = {}) {
  const requestHeaders = pimpBunnyDefaultHeaders(headers);
  const rawResponse = await httpRequest(url, requestHeaders);
  if (rawResponse && rawResponse.headers) {
    pimpBunnyRememberCookies(rawResponse.headers);
  }
  return pimpBunnyNormalizeResponse(rawResponse, options);
}
