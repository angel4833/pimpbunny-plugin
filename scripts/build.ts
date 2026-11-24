import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assembleBundle, getBundleInfo } from "../runtime/pluginHost.js";
import { buildZipBuffer } from "../runtime/zipBuilder.js";

function build() {
  const rootDir = process.cwd();
  const info = getBundleInfo();

  // 1. Write bundle.js
  fs.writeFileSync(path.join(rootDir, "bundle.js"), info.bundleCode, "utf8");
  console.log("Wrote bundle.js (" + Buffer.byteLength(info.bundleCode, "utf8") + " bytes)");

  // 2. Build plugin.zip
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
  fs.writeFileSync(path.join(rootDir, "plugin.zip"), zipBuffer);
  const sha256 = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  console.log("Wrote plugin.zip (" + zipBuffer.length + " bytes)");
  console.log("SHA256:", sha256);

  // Update sha256Sum in update.yaml
  const updateYamlPath = path.join(rootDir, "update.yaml");
  let updateYamlContent = fs.readFileSync(updateYamlPath, "utf8");
  updateYamlContent = updateYamlContent.replace(/sha256Sum:\s*"[^"]*"/, `sha256Sum: "${sha256}"`);
  fs.writeFileSync(updateYamlPath, updateYamlContent, "utf8");
  console.log("Updated sha256Sum in update.yaml");
}

build();
