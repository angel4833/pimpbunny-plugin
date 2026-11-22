const SAMPLE_LISTING_HTML = `
<div class="video-card">
  <a href="https://pimpbunny.com/videos/sample-clip-101/">
    <img src="/thumbs/sample-clip-101.jpg" alt="Sample Creator Showcase" />
  </a>
  <h3>Sample Creator Showcase</h3>
  <span>12:34</span>
  <a href="/onlyfans-creators/creator-alpha">Creator Alpha</a>
</div>
<div class="video-card">
  <a href="/videos/sample-clip-202">
    <img data-src="https://pimpbunny.com/thumbs/sample-clip-202.webp" alt="Studio Highlights" />
  </a>
  <h3>Studio Highlights</h3>
  <span>05:45</span>
  <a href="/onlyfans-creators/creator-beta">Creator Beta</a>
</div>
`.trim();

const SAMPLE_VIDEO_HTML = `
<html>
  <head>
    <meta property="og:title" content="Sample Creator Showcase" />
    <meta name="description" content="Sample video metadata parsed by extractVideoMetadata." />
  </head>
  <body>
    <h1>Sample Creator Showcase</h1>
    <a href="/onlyfans-creators/creator-alpha">Creator Alpha</a>
    <div>14,520 views</div>
    <div class="positive"><span>842</span></div>
    <script>var stream = "https://cdn.example.com/hls/sample-clip-101/master.m3u8";</script>
  </body>
</html>
`.trim();

const SAMPLE_AUTHOR_HTML = `
<html>
  <head>
    <meta property="og:title" content="Creator Alpha" />
    <meta name="description" content="Official creator profile summary." />
  </head>
  <body>
    <h1>Creator Alpha</h1>
    <img src="/avatars/creator-alpha.jpg" alt="Creator Alpha" />
    <div>42 videos</div>
    <div>12,300 subscribers</div>
  </body>
</html>
`.trim();

const PRESETS = [
  { label: "init()", method: "init", args: [] },
  { label: "runFunctionalityTest() [live network]", method: "runFunctionalityTest", args: [] },
  { label: "parseExternalLink(home)", method: "parseExternalLink", args: ["https://pimpbunny.com/?page=2"] },
  { label: "parseExternalLink(search)", method: "parseExternalLink", args: ["https://pimpbunny.com/search?q=featured&page=1"] },
  { label: "parseExternalLink(video)", method: "parseExternalLink", args: ["https://pimpbunny.com/videos/sample-clip-101"] },
  { label: "parseExternalLink(author)", method: "parseExternalLink", args: ["https://pimpbunny.com/onlyfans-creators/creator-alpha"] },
  { label: "parseVideosFromHtml(sample HTML)", method: "parseVideosFromHtml", args: [SAMPLE_LISTING_HTML] },
  { label: "extractVideoMetadata(sample HTML)", method: "extractVideoMetadata", args: [SAMPLE_VIDEO_HTML, "sample-clip-101"] },
  { label: "extractAuthorMetadata(sample HTML)", method: "extractAuthorMetadata", args: [SAMPLE_AUTHOR_HTML, "creator-alpha"] },
  { label: "getHomePage(0) [live network]", method: "getHomePage", args: [0] },
  { label: "getSearchResults('featured', 0) [live network]", method: "getSearchResults", args: [{ searchString: "featured" }, 0] },
  { label: "getVideoUriFromID('sample-clip-101')", method: "getVideoUriFromID", args: ["sample-clip-101"] },
  { label: "getAuthorUriFromID('creator-alpha')", method: "getAuthorUriFromID", args: ["creator-alpha"] }
];

const methodSelect = document.getElementById("method-select");
const presetSelect = document.getElementById("preset-select");
const argsInput = document.getElementById("args-input");
const runStatus = document.getElementById("run-status");
const resultOutput = document.getElementById("result-output");
const logsOutput = document.getElementById("logs-output");
const networkOutput = document.getElementById("network-output");

function populatePresets() {
  PRESETS.forEach((preset, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = preset.label;
    presetSelect.appendChild(opt);
  });

  presetSelect.addEventListener("change", () => {
    const preset = PRESETS[Number(presetSelect.value)];
    if (!preset) return;
    methodSelect.value = preset.method;
    argsInput.value = JSON.stringify(preset.args, null, 2);
  });
}

async function loadPluginInfo() {
  const res = await fetch("/api/plugin/info");
  const data = await res.json();

  const meta = data.pluginYaml?.metadata || {};
  const provider = data.pluginYaml?.providerData || {};

  document.getElementById("plugin-title").textContent = `${meta.prettyName || "Plugin"} (${meta.version || ""})`;
  document.getElementById("plugin-subtitle").textContent = meta.description || "";

  const kv = document.getElementById("manifest-details");
  const rows = [
    ["codeName", meta.codeName],
    ["apiVersion", data.pluginYaml?.apiVersion],
    ["developer", meta.developer],
    ["serviceUrl", provider.serviceUrl],
    ["issueTrackerUrl", meta.issueTrackerUrl]
  ];
  kv.innerHTML = "";
  rows.forEach(([key, val]) => {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = String(val ?? "");
    kv.appendChild(dt);
    kv.appendChild(dd);
  });

  const handleUrls = document.getElementById("handle-urls");
  handleUrls.innerHTML = "";
  (provider.handleUrls || []).forEach((url) => {
    const li = document.createElement("li");
    li.textContent = url;
    handleUrls.appendChild(li);
  });

  const tbody = document.getElementById("source-files-body");
  tbody.innerHTML = "";
  (data.sourceFiles || []).forEach((file) => {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = String(file.name ?? "");
    tdName.appendChild(code);

    const tdLines = document.createElement("td");
    tdLines.textContent = String(file.lines ?? 0);

    const tdBytes = document.createElement("td");
    tdBytes.textContent = String(file.bytes ?? 0);

    tr.appendChild(tdName);
    tr.appendChild(tdLines);
    tr.appendChild(tdBytes);
    tbody.appendChild(tr);
  });

  document.getElementById("update-yaml-pre").textContent = JSON.stringify(data.updateYaml, null, 2);
  document.getElementById("bundle-preview").textContent = data.bundleCode || "";

  methodSelect.innerHTML = "";
  (data.exportedMethods || []).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    methodSelect.appendChild(opt);
  });

  methodSelect.value = PRESETS[0].method;
  argsInput.value = JSON.stringify(PRESETS[0].args, null, 2);
}

async function invoke(method, args) {
  runStatus.textContent = `Running ${method}()...`;
  try {
    const res = await fetch("/api/plugin/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args })
    });
    const payload = await res.json();

    if (payload.error) {
      runStatus.textContent = `Failed in ${payload.durationMs}ms: ${payload.error}`;
    } else {
      runStatus.textContent = `Completed ${method}() in ${payload.durationMs}ms`;
    }

    resultOutput.textContent = JSON.stringify(
      payload.error ? { error: payload.error } : payload.result,
      null,
      2
    );

    logsOutput.textContent =
      payload.logs && payload.logs.length > 0
        ? payload.logs.map((l) => `[${l.level}] ${l.message}`).join("\n")
        : "No consoleLog entries.";

    networkOutput.textContent =
      payload.networkTrace && payload.networkTrace.length > 0
        ? JSON.stringify(payload.networkTrace, null, 2)
        : "No httpRequest calls.";
  } catch (err) {
    runStatus.textContent = `Request failed: ${err.message}`;
  }
}

document.getElementById("btn-run").addEventListener("click", () => {
  let parsedArgs = [];
  try {
    parsedArgs = JSON.parse(argsInput.value || "[]");
    if (!Array.isArray(parsedArgs)) {
      throw new Error("Arguments must be a JSON array.");
    }
  } catch (err) {
    runStatus.textContent = `Invalid JSON arguments: ${err.message}`;
    return;
  }
  invoke(methodSelect.value, parsedArgs);
});

document.getElementById("btn-init").addEventListener("click", () => {
  methodSelect.value = "init";
  argsInput.value = "[]";
  invoke("init", []);
});

document.getElementById("btn-selftest").addEventListener("click", () => {
  methodSelect.value = "runFunctionalityTest";
  argsInput.value = "[]";
  invoke("runFunctionalityTest", []);
});

populatePresets();
loadPluginInfo();
