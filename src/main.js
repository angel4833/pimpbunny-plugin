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
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, "https://pimpbunny.com").toString();
  } catch (_) {
    return "";
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

async function parseExternalLink(uriString) {
  try {
    const url = new URL(uriString);
    const args = Object.fromEntries(url.searchParams.entries());
    const page = Number.parseInt(args.page || args.p || "0", 10) || 0;

    if (url.pathname === "/" || url.pathname === "/home") {
      return { type: "homePage", pageCount: page };
    }

    if (url.pathname === "/search") {
      return {
        type: "searchResultsPage",
        searchRequest: {
          searchString: decodeURIComponent(args.query || args.q || ""),
          sortingType: args.sortingType || null,
          dateRange: args.dateRange || null,
          minQuality: null,
          maxQuality: null,
          minDuration: null,
          maxDuration: null,
        },
        pageCount: page,
      };
    }

    const videoMatch = url.pathname.match(/^\/videos\/([^/?#]+)/i);
    if (videoMatch) {
      return { type: "videoPage", iD: videoMatch[1] };
    }

    const authorMatch = url.pathname.match(/^\/onlyfans-creators\/([^/?#]+)/i);
    if (authorMatch) {
      return { type: "authorPage", iD: authorMatch[1] };
    }

    return { type: "unknown" };
  } catch (e) {
    consoleLog("error", `Error parsing external link: ${e.message}`);
    return { type: "unknown" };
  }
}

async function runFunctionalityTest() {
  consoleLog("info", "Running real PimpBunny plugin functionality test");

  try {
    const homeResponse = await httpRequest("https://pimpbunny.com/", {
      "User-Agent": "Mozilla/5.0",
    });

    if (!homeResponse || Number(homeResponse.status) !== 200) {
      consoleLog("error", `Homepage failed: status ${homeResponse ? homeResponse.status : "unknown"}`);
      return false;
    }

    const html = String(homeResponse.body || "");
    if (!html || !/(?:\/videos\/|video)/i.test(html)) {
      consoleLog("error", "Homepage did not contain recognizable video listing markup");
      return false;
    }

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

    const videoResponse = await httpRequest(getVideoUriFromID(sample.iD), {
      "User-Agent": "Mozilla/5.0",
    });

    if (!videoResponse || Number(videoResponse.status) !== 200) {
      consoleLog("error", `Video page failed for ${sample.iD}: status ${videoResponse ? videoResponse.status : "unknown"}`);
      return false;
    }

    const meta = extractVideoMetadata(videoResponse.body, sample.iD);
    if (!meta || !meta.title) {
      consoleLog("error", `Video metadata extraction failed for ${sample.iD}`);
      return false;
    }

    consoleLog("info", `Real functionality test passed for: ${meta.title}`);
    return true;
  } catch (e) {
    consoleLog("error", `Real functionality test failed: ${e.message}`);
    return false;
  }
}

async function getHomePage(page) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/?page=${page}`, {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return [];
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Home page fetch failed: ${e.message}`);
    return [];
  }
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    const response = await httpRequest(uri, thumbnailHttpHeaders || { "User-Agent": "Mozilla/5.0" });
    if (response.status === 200) {
      return response.bodyBase64 || "";
    }
    consoleLog("error", `Thumbnail download failed: ${response.status}`);
    return "";
  } catch (e) {
    consoleLog("error", `Thumbnail download error: ${e.message}`);
    return "";
  }
}

async function getSearchSuggestions(searchString) {
  try {
    const q = encodeURIComponent(searchString || "");
    const response = await httpRequest(`https://pimpbunny.com/search?q=${q}`, {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return [];

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
    const response = await httpRequest(`https://pimpbunny.com/search?q=${q}&page=${page}`, {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return [];
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Search results fetch failed: ${e.message}`);
    return [];
  }
}

function getVideoUriFromID(videoID) {
  return `https://pimpbunny.com/videos/${encodeURIComponent(videoID)}`;
}

async function getVideoMetadata(videoId, uvp) {
  try {
    const response = await httpRequest(getVideoUriFromID(videoId), {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return null;
    return extractVideoMetadata(response.body, videoId);
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
  return [];
}

function getAuthorUriFromID(authorID) {
  return `https://pimpbunny.com/onlyfans-creators/${encodeURIComponent(authorID)}`;
}

async function getAuthorPage(authorID) {
  try {
    const response = await httpRequest(getAuthorUriFromID(authorID), {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return null;
    return extractAuthorMetadata(response.body, authorID);
  } catch (e) {
    consoleLog("error", `Author page fetch failed: ${e.message}`);
    return null;
  }
}

async function getAuthorVideos(authorID, page) {
  try {
    const response = await httpRequest(`${getAuthorUriFromID(authorID)}?page=${page}`, {
      "User-Agent": "Mozilla/5.0",
    });
    if (response.status !== 200) return [];
    return parseVideosFromHtml(response.body);
  } catch (e) {
    consoleLog("error", `Author videos fetch failed: ${e.message}`);
    return [];
  }
}

function parseVideosFromHtml(htmlBody) {
  const source = String(htmlBody || "");
  const videos = [];
  const seen = {};
  const regex = /href=(?:["'])(https?:\/\/pimpbunny\.com\/videos\/|\/videos\/)([^"'?#/]+)[^"']*(?:["'])/gi;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const id = decodeURIComponent((match[2] || "").replace(/\/$/, ""));
    if (!id || seen[id]) continue;
    seen[id] = true;

    const cardStart = Math.max(0, match.index - 1200);
    const cardEnd = Math.min(source.length, regex.lastIndex + 1200);
    const card = source.slice(cardStart, cardEnd);

    const title = cleanText(
      findMatch(card, [
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
        /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i,
        /<img[^>]*alt=["']([^"']+)["'][^>]*>/i,
        /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
      ]) || id
    );

    const thumbnail = absoluteUrl(
      findMatch(card, [
        /<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>/i,
        /<img[^>]*data-src=["']([^"']+)["'][^>]*>/i,
        /https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/i,
      ])
    );

    const duration = parseDuration(
      findMatch(card, [
        /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/i,
      ])
    );

    const authorHref = findMatch(card, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/([^"'?#/]+)[^"']*["'][^>]*>/i,
    ]);
    const authorName = cleanText(
      findMatch(card, [
        /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
      ]) || ""
    );

    videos.push({
      iD: id,
      title: title || "Untitled",
      previewThumbnailUrl: thumbnail,
      duration: duration,
      authorID: authorHref || "unknown",
      authorName: authorName || "Unknown",
      viewsTotal: 0,
      uploadDate: Math.floor(Date.now() / 1000),
      ratingsPositivePercent: 0,
      maxQuality: 0,
      virtualReality: false,
    });
  }

  consoleLog("info", `Parsed ${videos.length} videos from HTML`);
  return videos;
}

function extractVideoMetadata(html, videoId) {
  const source = String(html || "");
  const meta = {
    iD: videoId,
    m3u8Uris: {},
    title: "",
    universalVideoPreview: {},
    authorID: "",
    authorName: "",
    authorSubscriberCount: 0,
    authorAvatar: "",
    actors: [],
    description: "",
    viewsTotal: 0,
    tags: [],
    categories: [],
    uploadDate: Math.floor(Date.now() / 1000),
    ratingsPositiveTotal: 0,
    ratingsNegativeTotal: 0,
    ratingsTotal: 0,
    virtualReality: false,
    chapters: {},
    rawHtml: source,
  };

  const title = cleanText(
    findMatch(source, [
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<title>([\s\S]*?)<\/title>/i,
    ])
  );
  if (title) meta.title = title;

  const authorHref = findMatch(source, [
    /\/onlyfans-creators\/([^"'?#/]+)/i,
  ]);
  if (authorHref) meta.authorID = authorHref;

  const authorName = cleanText(
    findMatch(source, [
      /<a[^>]*href=["'](?:https?:\/\/pimpbunny\.com)?\/onlyfans-creators\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
    ])
  );
  if (authorName) meta.authorName = authorName;

  const description = cleanText(
    findMatch(source, [
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ])
  );
  if (description) meta.description = description;

  const views = findMatch(source, [
    /(\d+(?:,\d+)*)\s*(?:views?|vistas)/i,
  ]);
  if (views) meta.viewsTotal = Number.parseInt(String(views).replace(/,/g, ""), 10) || 0;

  const m3u8Matches = source.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi) || [];
  m3u8Matches.forEach((url, index) => {
    meta.m3u8Uris[String(index)] = url;
  });

  const likes = findMatch(source, [
    /<(?:div|span)[^>]*class="[^"]*positive[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d+(?:,\d+)*)<\/span>/i,
  ]);
  if (likes) meta.ratingsPositiveTotal = Number.parseInt(String(likes).replace(/,/g, ""), 10) || 0;

  return meta;
}

function extractAuthorMetadata(html, authorId) {
  const source = String(html || "");
  const metadata = {
    iD: authorId,
    name: "",
    avatar: "",
    banner: "",
    aliases: [],
    description: "",
    advancedDescription: {},
    externalLinks: {},
    viewsTotal: 0,
    videosTotal: 0,
    subscribers: 0,
    rank: 0,
    rawHtml: source,
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
    /<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>/i,
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
