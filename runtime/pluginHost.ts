import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import yaml from "js-yaml";

export interface PluginLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export interface NetworkTraceEntry {
  url: string;
  status: number;
  durationMs: number;
  bytes: number;
  error?: string;
}

export interface InvocationResult {
  method: string;
  args: unknown[];
  result: unknown;
  logs: PluginLogEntry[];
  networkTrace: NetworkTraceEntry[];
  durationMs: number;
  error?: string;
}

export interface BundleInfo {
  pluginYaml: Record<string, unknown>;
  updateYaml: Record<string, unknown>;
  sourceFiles: Array<{ name: string; bytes: number; lines: number }>;
  bundleCode: string;
  exportedMethods: string[];
}

const ALLOWED_METHODS = [
  "init",
  "runFunctionalityTest",
  "parseExternalLink",
  "getHomePage",
  "downloadThumbnail",
  "getSearchSuggestions",
  "getSearchResults",
  "getVideoUriFromID",
  "getVideoMetadata",
  "getProgressThumbnails",
  "cancelGetProgressThumbnails",
  "getCommentUriFromID",
  "getComments",
  "getVideoSuggestions",
  "getAuthorUriFromID",
  "getAuthorPage",
  "getAuthorVideos",
  "parseVideosFromHtml",
  "extractVideoMetadata",
  "extractAuthorMetadata",
  "pimpBunnyRequest",
] as const;

const cacheStore = new Map<string, string>();

function getRootDir(): string {
  return process.cwd();
}

export function assembleBundle(): {
  sourceFiles: Array<{ name: string; bytes: number; lines: number }>;
  bundleCode: string;
} {
  const rootDir = getRootDir();
  const srcDir = path.join(rootDir, "src");
  const jsFiles = fs
    .readdirSync(srcDir)
    .filter((file) => file.endsWith(".js"))
    .sort((a, b) => a.localeCompare(b));

  const sourceFiles: Array<{ name: string; bytes: number; lines: number }> = [];
  let bundleCode = "";

  for (const file of jsFiles) {
    const fullPath = path.join(srcDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    sourceFiles.push({
      name: `./src/${file}`,
      bytes: Buffer.byteLength(content, "utf8"),
      lines: content.split(/\r?\n/).length,
    });
    bundleCode += `// ==== START: ./src/${file} ====\n`;
    bundleCode += content;
    bundleCode += `\n// ==== END: ./src/${file} ====\n\n`;
  }

  return { sourceFiles, bundleCode };
}

export function getBundleInfo(): BundleInfo {
  const rootDir = getRootDir();
  const pluginYamlRaw = fs.readFileSync(path.join(rootDir, "plugin.yaml"), "utf8");
  const updateYamlRaw = fs.readFileSync(path.join(rootDir, "update.yaml"), "utf8");

  const pluginYaml = (yaml.load(pluginYamlRaw) as Record<string, unknown>) || {};
  const updateYaml = (yaml.load(updateYamlRaw) as Record<string, unknown>) || {};
  const { sourceFiles, bundleCode } = assembleBundle();

  return {
    pluginYaml,
    updateYaml,
    sourceFiles,
    bundleCode,
    exportedMethods: [...ALLOWED_METHODS],
  };
}

export async function invokePluginMethod(
  methodName: string,
  args: unknown[] = []
): Promise<InvocationResult> {
  const start = Date.now();
  const logs: PluginLogEntry[] = [];
  const networkTrace: NetworkTraceEntry[] = [];

  if (!ALLOWED_METHODS.includes(methodName as (typeof ALLOWED_METHODS)[number])) {
    return {
      method: methodName,
      args,
      result: null,
      logs,
      networkTrace,
      durationMs: Date.now() - start,
      error: `Method "${methodName}" is not an exported Hedon Haven plugin contract method.`,
    };
  }

  const { bundleCode } = assembleBundle();

  async function sendMessage(action: string, payloadJson: string): Promise<string> {
    let payload: Record<string, unknown> = {};
    try {
      payload = payloadJson ? (JSON.parse(payloadJson) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }

    if (action === "consoleLog") {
      logs.push({
        level: String(payload.level || "info"),
        message: String(payload.message || ""),
        timestamp: new Date().toISOString(),
      });
      return JSON.stringify({ ok: true });
    }

    if (action === "writeCacheFile") {
      const filePath = String(payload.filePath || "");
      const contents = String(payload.base64EncodedContents || "");
      cacheStore.set(filePath, contents);
      return JSON.stringify({ ok: true, filePath });
    }

    if (action === "readCacheFile") {
      const filePath = String(payload.filePath || "");
      return JSON.stringify({
        ok: true,
        filePath,
        base64EncodedContents: cacheStore.get(filePath) ?? null,
      });
    }

    if (action === "httpRequest") {
      const targetUrl = String(payload.url || "");
      const reqHeaders = (payload.headers as Record<string, string>) || {};
      const reqStart = Date.now();

      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error(`Unsupported protocol: ${parsed.protocol}`);
        }

        const response = await fetch(targetUrl, {
          method: "GET",
          headers: reqHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });

        const arrayBuf = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const bodyText = buf.toString("utf8");
        const bodyBytes = Array.from(buf);

        const respHeaders: Record<string, string | string[]> = {};
        response.headers.forEach((value, key) => {
          respHeaders[key] = value;
        });
        if (typeof response.headers.getSetCookie === "function") {
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) {
            respHeaders["set-cookie"] = cookies;
          }
        }

        networkTrace.push({
          url: targetUrl,
          status: response.status,
          durationMs: Date.now() - reqStart,
          bytes: buf.byteLength,
        });

        return JSON.stringify({
          statusCode: response.status,
          status: response.status,
          headers: respHeaders,
          body: bodyText,
          bodyBytes,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        networkTrace.push({
          url: targetUrl,
          status: 0,
          durationMs: Date.now() - reqStart,
          bytes: 0,
          error: message,
        });
        return JSON.stringify({
          statusCode: 0,
          status: 0,
          headers: {},
          body: "",
          bodyBytes: [],
          error: message,
        });
      }
    }

    return JSON.stringify({ error: `Unknown bridge action: ${action}` });
  }

  const sandbox: Record<string, unknown> = {
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
    sendMessage,
  };

  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(bundleCode, context, { filename: "bundle.js", timeout: 5000 });

    const fn = context[methodName];
    if (typeof fn !== "function") {
      throw new Error(`Function "${methodName}" was not found in bundle.js`);
    }

    const rawResult = await (fn as (...callArgs: unknown[]) => unknown)(...args);
    const result = rawResult instanceof Uint8Array ? Array.from(rawResult) : rawResult;
    return {
      method: methodName,
      args,
      result,
      logs,
      networkTrace,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      method: methodName,
      args,
      result: null,
      logs,
      networkTrace,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}
