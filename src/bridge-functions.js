/// Host bridge functions

// Direct web requests are not allowed from the quickjs environment
async function httpRequest(url, headers) {
  const response = await sendMessage("httpRequest", JSON.stringify({
    "url": url,
    "headers": headers
  }));
  return JSON.parse(response);
}

// Mirror logs into the host (and also prefixes it correctly)
function consoleLog(level, message) {
  sendMessage("consoleLog", JSON.stringify({
    "level": level,
    "message": message
  }));
}

// File access is disabled in the quickjs environment
// Keep in mind that this function is only able to write the plugins own cache files
async function writeCacheFile(filePath, base64EncodedContents) {
  const response = await sendMessage("writeCacheFile", JSON.stringify({
    "filePath": filePath,
    "base64EncodedContents": base64EncodedContents
  }));
  // Returns error (as String) if any exception was encountered, otherwise returns true (as bool)
  return JSON.parse(response);
}

// File access is disabled in the quickjs environment
// Keep in mind that this function is only able to read the plugins own cache files
async function readCacheFile(filePath) {
  const response = await sendMessage("readCacheFile", JSON.stringify({
    "filePath": filePath
  }));
  // Returns the file content as a base64 encoded string or an error (as String) if any exception was encountered
  return JSON.parse(response);
}
