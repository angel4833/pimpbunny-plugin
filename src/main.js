const PLUGIN_CODE_NAME = "com.angel4833.pimpbunny";

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

function normalizeImageUrl(value) {
  const abs = absoluteUrl(value);
  if (!abs) return "";
  // Strip format=avif so Flutter Image.memory / NetworkImage receives standard JPEG
  return abs
    .replace(/([?&])format=avif(?:&quality=\d+)?/i, "$1")
    .replace(/[?&]+$/, "")
    .replace(/\?&/, "?");
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

function cleanAuthorId(rawId) {
  if (!rawId) return "";
  let clean = String(rawId).trim();
  clean = clean.replace(/^https?:\/\/[^/]+/i, "");
  clean = clean.replace(/^\/?(?:es|de|fr|it|pt|zh|ja|ru|tr)\//i, "/");
  clean = clean.replace(/^\/?onlyfans-creators\//i, "");
  clean = clean.replace(/^\/+|\/+$/g, "");
  return clean;
}

function isValidVideoId(id) {
  if (!id) return false;
  const clean = String(id).trim().toLowerCase();
  // Filter out numeric pagination segments (e.g. "1", "2", "3")
  if (/^\d{1,4}$/.test(clean)) return false;
  // Filter out reserved directory slugs
  if (/^(latest|top|search|videos|categories|tags|models|onlyfans-creators|feed)$/.test(clean)) return false;
  return true;
}

// Memory cache to remember author search rescues so subsequent pagination loads the author's next video pages
const searchAuthorCache = new Map();

function findAuthorInSearch(html) {
  const source = String(html || "");

  // Priority 1: Check ui-card-model cards
  const modelCardMatch = source.match(
    /<div[^>]*class=["'][^"']*ui-card-model[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/([^"'?#/]+)\/?/i
  );
  if (modelCardMatch && modelCardMatch[1]) {
    const slug = cleanAuthorId(modelCardMatch[1]);
    if (slug) return slug;
  }

  // Priority 2: Look for any link to /onlyfans-creators/<slug>/
  const creatorMatches = [...source.matchAll(/(?:href=["'](?:https?:\/\/pimpbunny\.com)?|\b)\/onlyfans-creators\/([^"'?#/]+)\/?/gi)];
  for (const match of creatorMatches) {
    const slug = cleanAuthorId(match[1]);
    if (slug && !/^(onlyfans-creators|categories|channels|tags)$/i.test(slug)) {
      return slug;
    }
  }

  return null;
}

function parseDuration(value) {
  const str = String(value || "").trim();
  const iso = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    return (Number(iso[1] || 0) * 3600) + (Number(iso[2] || 0) * 60) + Number(iso[3] || 0);
  }
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
    let videos = parseVideosFromHtml(response.body);
    if (videos.length === 0 && pageNum > 0) {
      const fallbackUrl = `https://pimpbunny.com/videos/?from_videos=${pageNum + 1}`;
      const fallbackResp = await pimpBunnyRequest(fallbackUrl);
      if (getStatusCode(fallbackResp) === 200 && fallbackResp.body) {
        videos = parseVideosFromHtml(fallbackResp.body);
      }
    }
    return videos;
  } catch (e) {
    consoleLog("error", `Home page fetch failed: ${e.message}`);
    return [];
  }
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    if (!uri) return [];
    const response = await pimpBunnyRequest(uri, thumbnailHttpHeaders || {}, { binary: true });
    if (getStatusCode(response) === 200) {
      if (response.isLegacyBase64Host) {
        return response.rawBodyBase64 || "";
      }
      return response.bodyBytes || [];
    }
    consoleLog("error", `Thumbnail download failed: ${getStatusCode(response)}`);
    return response.isLegacyBase64Host ? "" : [];
  } catch (e) {
    consoleLog("error", `Thumbnail download error: ${e.message}`);
    return [];
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
    const qRaw = (request && request.searchString) || "";
    const qTrimmed = qRaw.trim();
    const q = encodeURIComponent(qTrimmed);
    const qKey = qTrimmed.toLowerCase();
    const pageNum = Number(page) || 0;

    if (!q) return [];

    // If this query was already identified as an author search, fetch the author's videos directly
    const cachedAuthor = searchAuthorCache.get(qKey);
    if (cachedAuthor) {
      consoleLog("info", `Using rescued author "${cachedAuthor}" for search "${qRaw}" (page ${pageNum})`);
      return await getAuthorVideos(cachedAuthor, pageNum);
    }

    // PimpBunny search pagination uses &from_videos=${pageNum + 1}
    const url = pageNum <= 0
      ? `https://pimpbunny.com/search/?q=${q}`
      : `https://pimpbunny.com/search/?q=${q}&from_videos=${pageNum + 1}`;

    const response = await pimpBunnyRequest(url);
    if (getStatusCode(response) !== 200) {
      consoleLog("warning", `Search results status ${getStatusCode(response)} for ${url}`);
      return [];
    }

    let videos = parseVideosFromHtml(response.body);

    // Fallback if &from_videos= returned 0 videos on page > 0
    if (videos.length === 0 && pageNum > 0) {
      const fallbackUrls = [
        `https://pimpbunny.com/search/?q=${q}&from=${pageNum + 1}`,
        `https://pimpbunny.com/search/${pageNum + 1}/?q=${q}`,
      ];
      for (const fallbackUrl of fallbackUrls) {
        const fallbackResp = await pimpBunnyRequest(fallbackUrl);
        if (getStatusCode(fallbackResp) === 200 && fallbackResp.body) {
          const fallbackVideos = parseVideosFromHtml(fallbackResp.body);
          if (fallbackVideos.length > 0) {
            videos = fallbackVideos;
            break;
          }
        }
      }
    }

    // Author rescue: if search returned 0 video cards, check if the search result matched a creator/model
    if (videos.length === 0 && response.body) {
      const rescuedAuthor = findAuthorInSearch(response.body);
      if (rescuedAuthor) {
        consoleLog("info", `Author rescue triggered for "${qRaw}": fetching videos for creator "${rescuedAuthor}"`);
        searchAuthorCache.set(qKey, rescuedAuthor);
        return await getAuthorVideos(rescuedAuthor, pageNum);
      }
    }

    return videos;
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
  const clean = cleanAuthorId(authorID);
  return `https://pimpbunny.com/onlyfans-creators/${encodeURIComponent(clean)}/`;
}

async function getAuthorPage(authorID) {
  try {
    const cleanId = cleanAuthorId(authorID);
    const response = await pimpBunnyRequest(getAuthorUriFromID(cleanId));
    if (getStatusCode(response) !== 200) {
      consoleLog("error", `Author page status ${getStatusCode(response)} for ${cleanId}`);
      return null;
    }
    return extractAuthorMetadata(response.body, cleanId);
  } catch (e) {
    consoleLog("error", `Author page fetch failed: ${e.message}`);
    return null;
  }
}

async function getAuthorVideos(authorID, rawHtmlOrPage, maybePage) {
  try {
    let rawHtml = null;
    let pageNum = 0;
    if (typeof maybePage !== "undefined") {
      rawHtml = rawHtmlOrPage;
      pageNum = Number(maybePage) || 0;
    } else {
      pageNum = Number(rawHtmlOrPage) || 0;
    }

    const cleanId = cleanAuthorId(authorID);
    if (!cleanId) return [];

    if (pageNum === 0 && typeof rawHtml === "string" && rawHtml.length > 0) {
      const parsed = parseVideosFromHtml(rawHtml);
      if (parsed.length > 0) return parsed;
    }

    const baseUri = `https://pimpbunny.com/onlyfans-creators/${encodeURIComponent(cleanId)}/`;
    const url = pageNum <= 0
      ? baseUri
      : `${baseUri}${pageNum + 1}/`;
    const response = await pimpBunnyRequest(url);
    if (getStatusCode(response) !== 200) return [];

    let videos = parseVideosFromHtml(response.body);
    if (videos.length === 0 && pageNum > 0) {
      const fallbackUrl = `${baseUri}?from_videos=${pageNum + 1}`;
      const fallbackResp = await pimpBunnyRequest(fallbackUrl);
      if (getStatusCode(fallbackResp) === 200 && fallbackResp.body) {
        videos = parseVideosFromHtml(fallbackResp.body);
      }
    }
    return videos;
  } catch (e) {
    consoleLog("error", `Author videos fetch failed: ${e.message}`);
    return [];
  }
}

function buildVideoPreviewFromCard(rawCardHtml, id) {
  // Strip massive inline base64 blur placeholders BEFORE regex parsing so card data isn't truncated
  const cardHtml = String(rawCardHtml || "").replace(/src=["']data:[^"']*["']/gi, 'src=""');

  const title = cleanText(
    findMatch(cardHtml, [
      /<div[^>]*class=["'][^"']*ui-card-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i,
      /<img[^>]*alt=["']([^"']+)["'][^>]*>/i,
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ]) || id
  );

  const thumbnail = normalizeImageUrl(
    findMatch(cardHtml, [
      /<img[^>]*data-original=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-src=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-webp=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-lazy=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*src=["'](?!data:)([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
      /https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/i,
    ])
  );

  const previewVideo = absoluteUrl(
    findMatch(cardHtml, [
      /<img[^>]*data-preview=["']([^"']+)["'][^>]*>/i,
    ])
  );

  const duration = parseDuration(
    findMatch(cardHtml, [
      /class=["'][^"']*ui-card-duration[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/i,
    ])
  );

  const viewsRaw = findMatch(cardHtml, [
    /class=["'][^"']*ui-card-info[^"']*["'][^>]*>[\s\S]*?<span>\s*([\d.,]+\s*[KMB]?)\s*<\/span>/i,
    /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:views?|vistas)/i,
  ]);
  const viewsTotal = viewsRaw ? parseCompactCount(viewsRaw) : 0;

  const authorHref = cleanAuthorId(
    findMatch(cardHtml, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/([^"'?#/]+)[^"']*["'][^>]*>/i,
    ])
  );
  const authorName = cleanText(
    findMatch(cardHtml, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ]) || ""
  );

  const headers = pimpBunnyDefaultHeaders();
  const unavailableFields = ["ratingsPositivePercent", "maxQuality"];
  if (!thumbnail) unavailableFields.push("thumbnail");
  if (!previewVideo) {
    unavailableFields.push("previewVideo", "previewVideoHttpHeaders");
  }

  return {
    iD: id,
    title: title || "Untitled",
    plugin: PLUGIN_CODE_NAME,
    thumbnail: thumbnail || null,
    thumbnailHttpHeaders: headers,
    thumbnailBinary: null,
    previewVideo: previewVideo || null,
    previewVideoHttpHeaders: previewVideo ? headers : null,
    duration: duration,
    viewsTotal: viewsTotal,
    ratingsPositivePercent: null,
    maxQuality: null,
    virtualReality: false,
    authorName: authorName || "Unknown",
    authorID: authorHref || "unknown",
    verifiedAuthor: false,
    lastWatched: null,
    addedOn: null,
    unavailableFields: unavailableFields,
    scrapeFailException: null,
  };
}

function parseVideosFromHtml(htmlBody) {
  const source = String(htmlBody || "");
  const videos = [];
  const seen = {};

  const cardSplit = source.split(/<div[^>]*class=["'][^"']*ui-card-root[^"']*["'][^>]*>/i);
  if (cardSplit.length > 1) {
    for (let i = 1; i < cardSplit.length; i++) {
      // Strip inline data: URIs before slicing so we never cut off card metadata
      const cleanedChunk = cardSplit[i].replace(/src=["']data:[^"']*["']/gi, 'src=""');
      const card = cleanedChunk.slice(0, 4500);
      const idMatch = card.match(/href=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/([^"'?#/]+)\/?["']/i);
      if (!idMatch) continue;
      const id = decodeURIComponent((idMatch[1] || "").replace(/\/$/, ""));
      if (!isValidVideoId(id) || seen[id]) continue;
      seen[id] = true;
      videos.push(buildVideoPreviewFromCard(card, id));
    }
    if (videos.length > 0) {
      consoleLog("info", `Parsed ${videos.length} videos from HTML cards`);
      return videos;
    }
  }

  const regex = /href=(?:["'])(https?:\/\/pimpbunny\.com\/videos\/|\/videos\/)([^"'?#/]+)\/?(?:["'])/gi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const id = decodeURIComponent((match[2] || "").replace(/\/$/, ""));
    if (!isValidVideoId(id) || seen[id]) continue;
    seen[id] = true;

    const cardStart = Math.max(0, match.index - 200);
    const cardEnd = Math.min(source.length, regex.lastIndex + 1200);
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

  const m3u8Matches = source.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi) || [];
  m3u8Matches.forEach((url, index) => {
    const quality = extractQualityFromUrl(url) || (1080 - index * 100);
    if (!streams[String(quality)]) {
      streams[String(quality)] = url;
    }
  });

  return streams;
}

function extractJsonLd(source) {
  const matches = source.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of matches) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(inner);
      if (parsed && (parsed["@type"] === "VideoObject" || parsed.name || parsed.interactionStatistic)) {
        return parsed;
      }
    } catch (_) {}
  }
  return null;
}

function extractVideoMetadata(html, videoId, uvp) {
  const source = String(html || "");
  const headers = pimpBunnyDefaultHeaders();
  const ld = extractJsonLd(source);

  const title = cleanText(
    (ld && ld.name) ||
    findMatch(source, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<title>([\s\S]*?)<\/title>/i,
    ])
  );

  const authorHref = cleanAuthorId(
    findMatch(source, [
      /\/onlyfans-creators\/([^"'?#/]+)/i,
    ])
  );

  const authorName = cleanText(
    findMatch(source, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ])
  );

  const description = cleanText(
    (ld && ld.description) ||
    findMatch(source, [
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ])
  );

  let viewsTotal = 0;
  let ratingsPositiveTotal = 0;
  if (ld && Array.isArray(ld.interactionStatistic)) {
    for (const stat of ld.interactionStatistic) {
      const type = String(stat?.interactionType?.["@type"] || stat?.interactionType || "");
      const count = Number.parseInt(String(stat?.userInteractionCount || "0").replace(/,/g, ""), 10) || 0;
      if (/WatchAction/i.test(type)) viewsTotal = count;
      if (/LikeAction/i.test(type)) ratingsPositiveTotal = count;
    }
  }

  if (!viewsTotal) {
    const views = findMatch(source, [/(\d+(?:[.,]\d+)*)\s*(?:views?|vistas)/i]);
    if (views) viewsTotal = Number.parseInt(String(views).replace(/[.,]/g, ""), 10) || 0;
  }

  if (!ratingsPositiveTotal) {
    const likes = findMatch(source, [
      /<(?:div|span)[^>]*class="[^"]*positive[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d+(?:,\d+)*)<\/span>/i,
    ]);
    if (likes) ratingsPositiveTotal = Number.parseInt(String(likes).replace(/,/g, ""), 10) || 0;
  }

  let uploadDate = Math.floor(Date.now() / 1000);
  if (ld && ld.uploadDate) {
    const parsedTime = Date.parse(String(ld.uploadDate));
    if (!Number.isNaN(parsedTime)) {
      uploadDate = Math.floor(parsedTime / 1000);
    }
  }

  const m3u8Uris = extractStreamMap(source);
  const ogThumb = normalizeImageUrl(
    (ld && ld.thumbnailUrl) ||
    findMatch(source, [/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i])
  );

  const extractedAvatar = normalizeImageUrl(
    findMatch(source, [
      /<a[^>]*href=["'][^"']*\/onlyfans-creators\/[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i,
      /<img[^>]*src=["']([^"']*\/contents\/models\/[^"']+)["']/i,
      /<div[^>]*class=["'][^"']*author[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i,
      /<div[^>]*class=["'][^"']*model[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i,
      /<img[^>]*class=["'][^"']*avatar[^"']*["'][^>]*src=["']([^"']+)["']/i,
    ])
  );

  const safePreview = uvp && uvp.iD
    ? {
        ...uvp,
        plugin: PLUGIN_CODE_NAME,
        thumbnail: uvp.thumbnail ? normalizeImageUrl(uvp.thumbnail) : (ogThumb || null),
        thumbnailBinary: null,
        unavailableFields: Array.isArray(uvp.unavailableFields) ? uvp.unavailableFields : [],
      }
    : {
        iD: videoId,
        title: title || videoId,
        plugin: PLUGIN_CODE_NAME,
        thumbnail: ogThumb || null,
        thumbnailHttpHeaders: headers,
        thumbnailBinary: null,
        previewVideo: null,
        previewVideoHttpHeaders: null,
        duration: ld && ld.duration ? parseDuration(ld.duration) : 0,
        viewsTotal: viewsTotal,
        ratingsPositivePercent: null,
        maxQuality: null,
        virtualReality: false,
        authorName: authorName || "Unknown",
        authorID: authorHref || "unknown",
        verifiedAuthor: false,
        lastWatched: null,
        addedOn: null,
        unavailableFields: ["previewVideo", "previewVideoHttpHeaders", "ratingsPositivePercent", "maxQuality"],
        scrapeFailException: null,
      };

  // Author avatar must NEVER be null to avoid Hedon Haven Dart exception:
  // "Exception: Invalid argument(s): No host specified in URI file:///Avatar%20url%20is%20null"
  const authorAvatar =
    extractedAvatar ||
    (safePreview && safePreview.thumbnail) ||
    ogThumb ||
    "https://pimpbunny.com/favicon.ico";

  return {
    iD: videoId,
    plugin: PLUGIN_CODE_NAME,
    m3u8Uris: m3u8Uris,
    playbackHttpHeaders: headers,
    title: title || safePreview.title || videoId,
    universalVideoPreview: safePreview,
    authorID: authorHref || safePreview.authorID || "unknown",
    authorName: authorName || safePreview.authorName || "Unknown",
    authorSubscriberCount: null,
    authorAvatar: authorAvatar,
    actors: [],
    description: description,
    viewsTotal: viewsTotal,
    tags: [],
    categories: [],
    uploadDate: uploadDate,
    ratingsPositiveTotal: ratingsPositiveTotal,
    ratingsNegativeTotal: null,
    ratingsTotal: ratingsPositiveTotal,
    virtualReality: false,
    chapters: null,
    rawHtml: source,
    unavailableFields: ["authorSubscriberCount", "ratingsNegativeTotal", "chapters"],
    scrapeFailException: null,
  };
}

function extractAuthorMetadata(html, authorId) {
  const source = String(html || "");
  const cleanId = cleanAuthorId(authorId);
  const name = cleanText(
    findMatch(source, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    ])
  );

  const avatar = normalizeImageUrl(
    findMatch(source, [
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<img[^>]*data-original=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
      /<img[^>]*data-src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
      /<img[^>]*src=["'](?!data:)([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?)["'][^>]*>/i,
    ])
  ) || "https://pimpbunny.com/favicon.ico";

  const videosTotal = findMatch(source, [/(\d+(?:,\d+)*)\s*videos?/i]);
  const subs = findMatch(source, [/(\d+(?:,\d+)*)\s*(?:subscribers?|followers?)/i]);
  const desc = cleanText(
    findMatch(source, [
      /<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    ])
  );

  return {
    iD: cleanId,
    name: name || cleanId,
    plugin: PLUGIN_CODE_NAME,
    avatar: avatar,
    banner: null,
    aliases: [],
    description: desc,
    advancedDescription: {},
    externalLinks: {},
    viewsTotal: 0,
    videosTotal: videosTotal ? Number.parseInt(String(videosTotal).replace(/,/g, ""), 10) || 0 : 0,
    subscribers: subs ? Number.parseInt(String(subs).replace(/,/g, ""), 10) || 0 : 0,
    rank: null,
    rawHtml: source,
    unavailableFields: ["banner", "rank"],
    scrapeFailException: null,
  };
}
