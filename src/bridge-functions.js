/// Host bridge functions

function decodeBase64ToText(value) {
  if (!value || typeof value !== "string") return "";

  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
      }
      return String.fromCharCode(...bytes);
    }
  } catch (_) {}

  return value;
}

// Hedon Haven sends response.body as base64.
// HTML parsers need `body` as decoded text.
// Thumbnail/binary callers can use `bodyBase64` if needed.
async function httpRequest(url, headers = {}) {
  const response = await sendMessage("httpRequest", JSON.stringify({
    url: url,
    headers: headers || {}
  }));

  const parsed = JSON.parse(response);
  const bodyBase64 = parsed.body || "";

  return {
    ...parsed,
    status: parsed.statusCode ?? 0,
    statusCode: parsed.statusCode ?? 0,
    body: decodeBase64ToText(bodyBase64),
    bodyBase64: bodyBase64,
    headers: parsed.headers || {}
  };
}

function consoleLog(level, message) {
  sendMessage("consoleLog", JSON.stringify({
    level: level,
    message: String(message)
  }));
}

async function writeCacheFile(filePath, base64EncodedContents) {
  const response = await sendMessage("writeCacheFile", JSON.stringify({
    filePath: filePath,
    base64EncodedContents: base64EncodedContents
  }));
  return JSON.parse(response);
}

async function readCacheFile(filePath) {
  const response = await sendMessage("readCacheFile", JSON.stringify({
    filePath: filePath
  }));
  return JSON.parse(response);
}
