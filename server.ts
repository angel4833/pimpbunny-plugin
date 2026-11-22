import express from "express";
import fs from "node:fs";
import path from "node:path";
import { getBundleInfo, invokePluginMethod } from "./runtime/pluginHost.js";
import { buildZipBuffer } from "./runtime/zipBuilder.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pimpbunny-plugin-runtime" });
});

app.get("/api/plugin/info", (_req, res) => {
  try {
    const info = getBundleInfo();
    res.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get("/api/plugin/bundle.js", (_req, res) => {
  try {
    const info = getBundleInfo();
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="bundle.js"');
    res.send(info.bundleCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get("/api/plugin/zip", (_req, res) => {
  try {
    const rootDir = process.cwd();
    const info = getBundleInfo();
    const pluginYamlBuf = fs.readFileSync(path.join(rootDir, "plugin.yaml"));
    const entries = [
      { name: "plugin.yaml", content: pluginYamlBuf },
      { name: "bundle.js", content: info.bundleCode },
    ];
    for (const file of info.sourceFiles) {
      const rel = file.name.replace(/^\.\//, "");
      entries.push({
        name: rel,
        content: fs.readFileSync(path.join(rootDir, rel)),
      });
    }
    const zipBuffer = buildZipBuffer(entries);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="pimpbunny-plugin.zip"');
    res.send(zipBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post("/api/plugin/invoke", async (req, res) => {
  const method = typeof req.body?.method === "string" ? req.body.method : "";
  const args = Array.isArray(req.body?.args) ? req.body.args : [];

  if (!method) {
    res.status(400).json({ error: "Missing required 'method' field." });
    return;
  }

  const outcome = await invokePluginMethod(method, args);
  res.json(outcome);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`PimpBunny plugin runtime listening on http://${HOST}:${PORT}`);
});
