/// Host bridge functions from the official Hedon Haven JS example.
async function httpRequest(url, headers) {
  const response = await sendMessage("httpRequest", JSON.stringify({
    "url": url,
    "headers": headers || {}
  }));
  return JSON.parse(response);
}

function consoleLog(level, message) {
  sendMessage("consoleLog", JSON.stringify({
    "level": level,
    "message": String(message)
  }));
}

async function writeCacheFile(filePath, base64EncodedContents) {
  const response = await sendMessage("writeCacheFile", JSON.stringify({
    "filePath": filePath,
    "base64EncodedContents": base64EncodedContents
  }));
  return JSON.parse(response);
}

async function readCacheFile(filePath) {
  const response = await sendMessage("readCacheFile", JSON.stringify({
    "filePath": filePath
  }));
  return JSON.parse(response);
}
