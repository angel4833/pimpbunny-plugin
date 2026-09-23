/// Host bridge functions

function decodeBase64ToText(value) {
  if (!value || typeof value !== "string") return "";
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
      return String.fromCharCode(...bytes);
    }
  } catch (_) {}
  return value;
}

function decodeBase64ToBytes(value) {
  if (!value || typeof value !== "string") return [];
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      return Array.from(binary, (c) => c.charCodeAt(0));
    }
  } catch (_) {}
  return [];
}

async function httpRequest(url, headers = {}) {
  const raw = await sendMessage("httpRequest", JSON.stringify({ url, headers: headers || {} }));
  const parsed = JSON.parse(raw);
  const encoded = parsed.body || "";
  return {
    ...parsed,
    status: parsed.statusCode ?? 0,
    statusCode: parsed.statusCode ?? 0,
    body: decodeBase64ToText(encoded),
    bodyBase64: encoded,
    headers: parsed.headers || {}
  };
}

function consoleLog(level, message) {
  sendMessage("consoleLog", JSON.stringify({ level, message: String(message) }));
}

async function writeCacheFile(filePath, base64EncodedContents) {
  return JSON.parse(await sendMessage("writeCacheFile", JSON.stringify({ filePath, base64EncodedContents })));
}

async function readCacheFile(filePath) {
  return JSON.parse(await sendMessage("readCacheFile", JSON.stringify({ filePath })));
}
