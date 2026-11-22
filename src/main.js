const PLUGIN_CODE_NAME = "com.hedon_haven.pimpbunny";

function getStatusCode(response) {
  if (!response) return 0;
  return Number(response.statusCode ?? response.status ?? 0);
}

async function init() {
  consoleLog("info", "PimpBunny plugin initialized successfully");
  return true;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed || /^data:/i.test(trimmed)) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://pimpbunny.com${trimmed}`;
  try {
    return new URL(trimmed, "https://pimpbunny.com").toString();
  } catch (_) {
    return `https://pimpbunny.com/${trimmed.replace(/^\/+/, "")}`;
  }
}

function parseDuration(value) {
  const str = String(value || "").trim();
  const match = str.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!match) return 0;
  const parts = match[1].split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseCompactCount(value) {
  const str = String(value || "").trim().replace(/,/g, "");
  const match = str.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return Number.parseInt(str.replace(/[^\d]/g, ""), 10) || 0;
  const num = Number.parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(num * 1000);
  if (suffix === "M") return Math.round(num * 1000000);
  if (suffix === "B") return Math.round(num * 1000000000);
  return Math.round(num);
}

function findMatch(source, patterns) {
  const text = String(source || "");
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      return match[1] || match[0] || "";
    }
  }
  return "";
}

function safeParseUrl(uriString) {
  if (typeof URL === "function") {
    try {
      const parsed = new URL(uriString);
      return {
        pathname: parsed.pathname || "/",
        params: Object.fromEntries(parsed.searchParams.entries()),
      };
    } catch (_) {}
  }

  const m = String(uriString || "").match(/^https?:\/\/[^/?#]+([^?#]*)(?:\?([^#]*))?/i);
  if (!m) throw new Error(`Invalid URI: ${uriString}`);
  const params = {};
  if (m[2]) {
    for (const pair of m[2].split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? "" : pair.slice(eq + 1);
      params[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
    }
  }
  return { pathname: m[1] || "/", params };
}

async function parseExternalLink(uriString) {
  try {
    const { pathname, params } = safeParseUrl(uriString);
    const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const page = Number.parseInt(params.page || params.p || "0", 10) || 0;

    if (normalizedPath === "/" || normalizedPath === "/home" || normalizedPath === "/videos") {
      return { type: "homePage", iD: null, searchRequest: null, pageCount: page };
    }

    if (normalizedPath === "/search") {
      return {
        type: "searchResultsPage",
        iD: null,
        searchRequest: {
          searchString: decodeURIComponent(params.query || params.q || ""),
          sortingType: params.sortingType || "Relevance",
          dateRange: params.dateRange || "All time",
          minQuality: null,
          maxQuality: null,
          minDuration: null,
          maxDuration: null,
          minFramesPerSecond: null,
          maxFramesPerSecond: null,
          virtualReality: false,
          categoriesInclude: [],
          categoriesExclude: [],
          keywordsInclude: [],
          keywordsExclude: [],
          historySearch: false,
        },
        pageCount: page,
      };
    }

    const videoMatch = normalizedPath.match(/^\/videos\/([^/?#]+)$/i);
    if (videoMatch) {
      return { type: "videoPage", iD: videoMatch[1], searchRequest: null, pageCount: null };
    }

    const authorMatch = normalizedPath.match(/^\/onlyfans-creators\/([^/?#]+)$/i);
    if (authorMatch) {
      return { type: "authorPage", iD: authorMatch[1], searchRequest: null, pageCount: null };
    }

    return { type: "unknown", iD: null, searchRequest: null, pageCount: null };
  } catch (e) {
    consoleLog("error", `Error parsing external link: ${e.message}`);
    return { type: "unknown", iD: null, searchRequest: null, pageCount: null };
  }
}

async function runFunctionalityTest() {
  consoleLog("info", "Running real PimpBunny plugin functionality test");

  try {
    const homeResponse = await pimpBunnyRequest("https://pimpbunny.com/videos/");
    const homeStatus = getStatusCode(homeResponse);

    if (homeStatus !== 200) {
      const challenge = /bunny-shield|cdn-challenge|shield-challenge/i.test(String(homeResponse?.body || ""));
      consoleLog(
        "error",
        `Homepage failed: status ${homeStatus}${challenge ? " (Bunny Shield challenge)" : ""}`
      );
      return false;
    }

    const html = String(homeResponse.body || "");
    const videos = parseVideosFromHtml(html);
    if (!videos || videos.length === 0) {
      consoleLog("error", "Homepage parsing returned zero valid video entries");
      return false;
    }

    const sample = videos[0];
    if (!sample || !sample.iD) {
      consoleLog("error", "First parsed video did not include a valid ID");
      return false;
    }

    const videoResponse = await pimpBunnyRequest(getVideoUriFromID(sample.iD));
    const videoStatus = getStatusCode(videoResponse);

    if (videoStatus !== 200) {
      consoleLog("error", `Video page failed for ${sample.iD}: status ${videoStatus}`);
      return false;
    }

    const meta = extractVideoMetadata(videoResponse.body, sample.iD, sample);
    if (!meta || !meta.title) {
      consoleLog("error", `Video metadata extraction failed for ${sample.iD}`);
      return false;
    }

    const streamCount = Object.keys(meta.m3u8Uris || {}).length;
    consoleLog("info", `Real functionality test passed for: ${meta.title} (${streamCount} streams)`);
    return streamCount > 0;
  } catch (e) {
    consoleLog("error", `Real functionality test failed: ${e.message}`);
    return false;
  }
}

async function getHomePage(page) {
  try {
    const pageNum = Number(page) || 0;
    const url = pageNum <= 0
      ? "https://pimpbunny.com/videos/"
      : `https://pimpbunny.com/videos/${pageNum + 1}/`;
    const response = await pimpBunnyRequest(url);
    if (getStatusCode(response) !== 200) {
      consoleLog("warning", `Home page status ${getStatusCode(response)} for ${url}`);
      return [];
    }
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Home page fetch failed: ${e.message}`);
    return [];
  }
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    if (!uri) return new Uint8Array(0);
    const response = await pimpBunnyRequest(uri, thumbnailHttpHeaders || {});
    if (getStatusCode(response) === 200) {
      if (response.bodyBytes) {
        return Uint8Array.from(response.bodyBytes);
      }
      if (response.bodyBase64 && typeof atob === "function") {
        const bin = atob(response.bodyBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      return new Uint8Array(0);
    }
    consoleLog("error", `Thumbnail download failed: ${getStatusCode(response)}`);
    return new Uint8Array(0);
  } catch (e) {
    consoleLog("error", `Thumbnail download error: ${e.message}`);
    return new Uint8Array(0);
  }
}

async function getSearchSuggestions(searchString) {
  try {
    const q = encodeURIComponent(searchString || "");
    const response = await pimpBunnyRequest(`https://pimpbunny.com/search/?q=${q}`);
    if (getStatusCode(response) !== 200) return [];

    const results = [];
    const pattern = /<li[^>]*class="[^"]*suggestion[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = pattern.exec(response.body)) !== null && results.length < 10) {
      const value = cleanText(match[1]);
      if (value) results.push(value);
    }
    return results;
  } catch (e) {
    consoleLog("warning", `Search suggestions failed: ${e.message}`);
    return [];
  }
}

async function getSearchResults(request, page) {
  try {
    const q = encodeURIComponent((request && request.searchString) || "");
    const pageNum = Number(page) || 0;
    const url = pageNum <= 0
      ? `https://pimpbunny.com/search/?q=${q}`
      : `https://pimpbunny.com/search/${pageNum + 1}/?q=${q}`;
    const response = await pimpBunnyRequest(url);
    if (getStatusCode(response) !== 200) {
      consoleLog("warning", `Search results status ${getStatusCode(response)} for ${url}`);
      return [];
    }
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Search results fetch failed: ${e.message}`);
    return [];
  }
}

function getVideoUriFromID(videoID) {
  return `https://pimpbunny.com/videos/${encodeURIComponent(videoID)}/`;
}

async function getVideoMetadata(videoId, uvp) {
  try {
    const response = await pimpBunnyRequest(getVideoUriFromID(videoId));
    if (getStatusCode(response) !== 200) {
      consoleLog("error", `Video metadata status ${getStatusCode(response)} for ${videoId}`);
      return null;
    }
    return extractVideoMetadata(response.body, videoId, uvp);
  } catch (e) {
    consoleLog("error", `Video metadata fetch failed: ${e.message}`);
    return null;
  }
}

async function getProgressThumbnails(videoID, rawHtml) {
  return [];
}

function cancelGetProgressThumbnails() {}

function getCommentUriFromID(commentID, videoID) {
  return `${getVideoUriFromID(videoID)}#comment-${commentID}`;
}

async function getComments(videoID, rawHtml, page) {
  return [];
}

async function getVideoSuggestions(videoID, rawHtml, page) {
  try {
    if (Number(page) > 0) return [];
    let html = rawHtml;
    if (!html) {
      const response = await pimpBunnyRequest(getVideoUriFromID(videoID));
      if (getStatusCode(response) !== 200) return [];
      html = response.body;
    }
    return parseVideosFromHtml(html).filter((v) => v.iD !== videoID);
  } catch (e) {
    consoleLog("warning", `Video suggestions failed: ${e.message}`);
    return [];
  }
}

function getAuthorUriFromID(authorID) {
  return `https://pimpbunny.com/onlyfans-creators/${encodeURIComponent(authorID)}/`;
}

async function getAuthorPage(authorID) {
  try {
    const response = await pimpBunnyRequest(getAuthorUriFromID(authorID));
    if (getStatusCode(response) !== 200) {
      consoleLog("error", `Author page status ${getStatusCode(response)} for ${authorID}`);
      return null;
    }
    return extractAuthorMetadata(response.body, authorID);
  } catch (e) {
    consoleLog("error", `Author page fetch failed: ${e.message}`);
    return null;
  }
}

async function getAuthorVideos(authorID, rawHtmlOrPage, maybePage) {
  try {
    // Hedon Haven's wrapper passes (authorID, rawHtml, page), while 2-arg callers pass (authorID, page).
    let rawHtml = null;
    let pageNum = 0;
    if (typeof maybePage !== "undefined") {
      rawHtml = rawHtmlOrPage;
      pageNum = Number(maybePage) || 0;
    } else {
      pageNum = Number(rawHtmlOrPage) || 0;
    }

    if (pageNum === 0 && typeof rawHtml === "string" && rawHtml.length > 0) {
      const parsed = parseVideosFromHtml(rawHtml);
      if (parsed.length > 0) return parsed;
    }

    const url = pageNum <= 0
      ? getAuthorUriFromID(authorID)
      : `${getAuthorUriFromID(authorID)}${pageNum + 1}/`;
    const response = await pimpBunnyRequest(url);
    if (getStatusCode(response) !== 200) return [];
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Author videos fetch failed: ${e.message}`);
    return [];
  }
}

function buildVideoPreviewFromCard(cardHtml, id) {
  const title = cleanText(
    findMatch(cardHtml, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i,
      /class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p|a|h[1-6])>/i,
      /<img[^>]*alt=["']([^"']+)["'][^>]*>/i,
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ]) || id
  );

  const thumbnail = absoluteUrl(
    findMatch(cardHtml, [
      /<img[^>]*data-src=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-original=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-lazy=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*src=["'](?!data:)([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
      /https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s>]*)?/i,
    ])
  );

  const duration = parseDuration(
    findMatch(cardHtml, [
      /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/i,
    ])
  );

  const viewsRaw = findMatch(cardHtml, [
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:views?|vistas)/i,
  ]);
  const viewsTotal = viewsRaw ? parseCompactCount(viewsRaw) : 0;

  const authorHref = findMatch(cardHtml, [
    /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/([^"'?#/]+)[^"']*["'][^>]*>/i,
  ]);
  const authorName = cleanText(
    findMatch(cardHtml, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ]) || ""
  );

  const headers = pimpBunnyDefaultHeaders();

  return {
    iD: id,
    title: title || "Untitled",
    plugin: PLUGIN_CODE_NAME,
    thumbnail: thumbnail || null,
    thumbnailHttpHeaders: headers,
    thumbnailBinary: [],
    previewVideo: null,
    previewVideoHttpHeaders: null,
    duration: duration,
    viewsTotal: viewsTotal,
    ratingsPositivePercent: 0,
    maxQuality: 0,
    virtualReality: false,
    authorName: authorName || "Unknown",
    authorID: authorHref || "unknown",
    verifiedAuthor: false,
    lastWatched: null,
    addedOn: null,
    unavailableFields: [],
    scrapeFailException: null,
  };
}

function parseVideosFromHtml(htmlBody) {
  const source = String(htmlBody || "");
  const videos = [];
  const seen = {};

  // Prefer structured card containers to prevent bleeding metadata between adjacent cards
  const cardSplit = source.split(/<div[^>]*class=["'][^"']*ui-card-root[^"']*["'][^>]*>/i);
  if (cardSplit.length > 1) {
    for (let i = 1; i < cardSplit.length; i++) {
      const card = cardSplit[i].slice(0, 4000);
      const idMatch = card.match(/href=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/([^"'?#/]+)\/?["']/i);
      if (!idMatch) continue;
      const id = decodeURIComponent((idMatch[1] || "").replace(/\/$/, ""));
      if (!id || seen[id]) continue;
      seen[id] = true;
      videos.push(buildVideoPreviewFromCard(card, id));
    }
    if (videos.length > 0) {
      consoleLog("info", `Parsed ${videos.length} videos from HTML cards`);
      return videos;
    }
  }

  // Fallback for generic/minimal HTML fixtures
  const regex = /href=(?:["'])(https?:\/\/pimpbunny\.com\/videos\/|\/videos\/)([^"'?#/]+)\/?(?:["'])/gi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const id = decodeURIComponent((match[2] || "").replace(/\/$/, ""));
    if (!id || seen[id]) continue;
    seen[id] = true;

    const cardStart = Math.max(0, match.index - 200);
    const cardEnd = Math.min(source.length, regex.lastIndex + 1000);
    const card = source.slice(cardStart, cardEnd);
    videos.push(buildVideoPreviewFromCard(card, id));
  }

  consoleLog("info", `Parsed ${videos.length} videos from HTML`);
  return videos;
}

function extractQualityFromUrl(url) {
  const m = String(url).match(/_(\d{3,4})p\.mp4/i);
  if (m) return Number.parseInt(m[1], 10);
  return 720;
}

function extractStreamMap(source) {
  const streams = {};

  // 1. Check KVS kt_player video_url / video_alt_url* variables
  const ktPairs = [
    ["video_url", "video_url_text"],
    ["video_alt_url", "video_alt_url_text"],
    ["video_alt_url2", "video_alt_url2_text"],
    ["video_alt_url3", "video_alt_url3_text"],
    ["video_alt_url4", "video_alt_url4_text"],
  ];

  for (const [urlKey, labelKey] of ktPairs) {
    const urlMatch = source.match(new RegExp(`${urlKey}\\s*:\\s*['"](https?:\\/\\/[^'"]+\\.mp4[^'"]*)['"]`, "i"));
    if (!urlMatch) continue;
    const streamUrl = urlMatch[1];
    if (/\.mp4\.(?:jpg|jpeg|png|webp|avif)/i.test(streamUrl)) continue;

    const labelMatch = source.match(new RegExp(`${labelKey}\\s*:\\s*['"](\\d{3,4})p?['"]`, "i"));
    const quality = labelMatch ? Number.parseInt(labelMatch[1], 10) : extractQualityFromUrl(streamUrl);
    streams[String(quality)] = streamUrl;
  }

  // 2. Fallback: scan any direct .mp4 URLs (excluding .mp4.jpg preview screenshots)
  if (Object.keys(streams).length === 0) {
    const mp4Matches = source.match(/https?:\/\/[^\s"'<>\\]+\.mp4(?:\/?\?[^\s"'<>\\]*)?(?=["'\s<>\\]|$)/gi) || [];
    for (const url of mp4Matches) {
      if (/\.mp4\.(?:jpg|jpeg|png|webp|avif)/i.test(url)) continue;
      if (/\/preview/i.test(url)) continue;
      const quality = extractQualityFromUrl(url);
      if (!streams[String(quality)] || /v-acctoken=/i.test(url)) {
        streams[String(quality)] = url;
      }
    }
  }

  // 3. Also extract .m3u8 streams if present
  const m3u8Matches = source.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi) || [];
  m3u8Matches.forEach((url, index) => {
    const quality = extractQualityFromUrl(url) || (1080 - index * 100);
    if (!streams[String(quality)]) {
      streams[String(quality)] = url;
    }
  });

  return streams;
}

function extractVideoMetadata(html, videoId, uvp) {
  const source = String(html || "");
  const headers = pimpBunnyDefaultHeaders();

  const title = cleanText(
    findMatch(source, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<title>([\s\S]*?)<\/title>/i,
    ])
  );

  const authorHref = findMatch(source, [
    /\/onlyfans-creators\/([^"'?#/]+)/i,
  ]);

  const authorName = cleanText(
    findMatch(source, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ])
  );

  const description = cleanText(
    findMatch(source, [
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ])
  );

  const views = findMatch(source, [
    /(\d+(?:[.,]\d+)*)\s*(?:views?|vistas)/i,
  ]);
  const viewsTotal = views ? Number.parseInt(String(views).replace(/[.,]/g, ""), 10) || 0 : 0;

  const likes = findMatch(source, [
    /<(?:div|span)[^>]*class="[^"]*positive[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d+(?:,\d+)*)<\/span>/i,
  ]);
  const ratingsPositiveTotal = likes ? Number.parseInt(String(likes).replace(/,/g, ""), 10) || 0 : 0;

  const m3u8Uris = extractStreamMap(source);

  const safePreview = uvp && uvp.iD
    ? { ...uvp, plugin: uvp.plugin || PLUGIN_CODE_NAME }
    : {
        iD: videoId,
        title: title || videoId,
        plugin: PLUGIN_CODE_NAME,
        thumbnail: absoluteUrl(
          findMatch(source, [
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
          ])
        ) || null,
        thumbnailHttpHeaders: headers,
        thumbnailBinary: [],
        previewVideo: null,
        previewVideoHttpHeaders: null,
        duration: 0,
        viewsTotal: viewsTotal,
        ratingsPositivePercent: 0,
        maxQuality: 0,
        virtualReality: false,
        authorName: authorName || "Unknown",
        authorID: authorHref || "unknown",
        verifiedAuthor: false,
        lastWatched: null,
        addedOn: null,
        unavailableFields: [],
        scrapeFailException: null,
      };

  return {
    iD: videoId,
    plugin: PLUGIN_CODE_NAME,
    m3u8Uris: m3u8Uris,
    playbackHttpHeaders: headers,
    title: title || safePreview.title || videoId,
    universalVideoPreview: safePreview,
    authorID: authorHref || safePreview.authorID || "",
    authorName: authorName || safePreview.authorName || "",
    authorSubscriberCount: 0,
    authorAvatar: "",
    actors: [],
    description: description,
    viewsTotal: viewsTotal,
    tags: [],
    categories: [],
    uploadDate: Math.floor(Date.now() / 1000),
    ratingsPositiveTotal: ratingsPositiveTotal,
    ratingsNegativeTotal: 0,
    ratingsTotal: ratingsPositiveTotal,
    virtualReality: false,
    chapters: {},
    rawHtml: source,
    unavailableFields: [],
    scrapeFailException: null,
  };
}

function extractAuthorMetadata(html, authorId) {
  const source = String(html || "");
  const metadata = {
    iD: authorId,
    name: "",
    plugin: PLUGIN_CODE_NAME,
    avatar: null,
    banner: null,
    aliases: [],
    description: "",
    advancedDescription: {},
    externalLinks: {},
    viewsTotal: 0,
    videosTotal: 0,
    subscribers: 0,
    rank: 0,
    rawHtml: source,
    unavailableFields: [],
    scrapeFailException: null,
  };

  const name = cleanText(
    findMatch(source, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    ])
  );
  if (name) metadata.name = name;

  const avatar = findMatch(source, [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<img[^>]*data-src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
    /<img[^>]*src=["'](?!data:)([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
  ]);
  if (avatar) metadata.avatar = absoluteUrl(avatar);

  const videosTotal = findMatch(source, [
    /(\d+(?:,\d+)*)\s*videos?/i,
  ]);
  if (videosTotal) metadata.videosTotal = Number.parseInt(String(videosTotal).replace(/,/g, ""), 10) || 0;

  const subs = findMatch(source, [
    /(\d+(?:,\d+)*)\s*(?:subscribers?|followers?)/i,
  ]);
  if (subs) metadata.subscribers = Number.parseInt(String(subs).replace(/,/g, ""), 10) || 0;

  const desc = cleanText(
    findMatch(source, [
      /<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    ])
  );
  if (desc) metadata.description = desc;

  return metadata;
}
