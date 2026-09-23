async function init() {
  consoleLog("info", "PimpBunny plugin initialized successfully");
  return true;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function absoluteUrl(value) {
  if (!value) return "";
  try { return new URL(value, "https://pimpbunny.com").toString(); } catch (_) { return ""; }
}

function parseDuration(value) {
  const parts = String(value || "").trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

async function parseExternalLink(uriString) {
  try {
    const url = new URL(uriString);
    const args = Object.fromEntries(url.searchParams.entries());
    const page = Number.parseInt(args.page || "0", 10) || 0;
    if (url.pathname === "/" || url.pathname === "/home") return { type: "homePage", pageCount: page };
    if (url.pathname === "/search") return {
      type: "searchResultsPage",
      searchRequest: {
        searchString: args.query || args.q || "",
        sortingType: args.sortingType || null, dateRange: args.dateRange || null,
        minQuality: null, maxQuality: null, minDuration: null, maxDuration: null
      }, pageCount: page
    };
    const video = url.pathname.match(/^\/videos\/([^/?#]+)/i);
    if (video) return { type: "videoPage", iD: video[1] };
    const author = url.pathname.match(/^\/onlyfans-creators\/([^/?#]+)/i);
    if (author) return { type: "authorPage", iD: author[1] };
    return { type: "unknown" };
  } catch (e) { consoleLog("error", `Error parsing link: ${e.message}`); return { type: "unknown" }; }
}

async function runFunctionalityTest() {
  try { return (await httpRequest("https://pimpbunny.com/", {"User-Agent":"Mozilla/5.0"})).status === 200; }
  catch (e) { consoleLog("error", `Functionality test failed: ${e.message}`); return false; }
}

function parseVideosFromHtml(html) {
  const source = String(html || ""), result = [], seen = new Set();
  // The old expression required a class and contained an invalid/truncated
  // regular expression. Use video URLs, which are the stable identifier.
  const links = /<a\b[^>]*\bhref=["'](?:https?:\/\/pimpbunny\.com)?\/videos\/([^"'/?#]+)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
  let match;
  while ((match = links.exec(source))) {
    const id = match[1]; if (!id || seen.has(id)) continue; seen.add(id);
    const card = source.slice(Math.max(0, match.index - 1800), Math.min(source.length, links.lastIndex + 1800));
    const titleMatch = card.match(/<(?:h[1-6]|div|span)[^>]*(?:title|name|card-title|video-title)[^>]*>([\s\S]*?)<\//i);
    const imageMatch = card.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    const durationMatch = card.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    const authorMatch = card.match(/\/onlyfans-creators\/([^"'/?#]+)/i);
    result.push({
      iD: id, title: cleanText(titleMatch ? titleMatch[1] : id),
      thumbnail: absoluteUrl(imageMatch ? imageMatch[1] : ""), thumbnailHttpHeaders: {},
      previewVideo: "", previewVideoHttpHeaders: {}, duration: parseDuration(durationMatch && durationMatch[1]),
      viewsTotal: 0, ratingsPositivePercent: 0, maxQuality: 0, virtualReality: false,
      authorName: "", authorID: authorMatch ? authorMatch[1] : "", verifiedAuthor: false
    });
  }
  consoleLog("info", `Parsed ${result.length} videos from HTML`);
  return result;
}

async function getHomePage(page) {
  try { const r = await httpRequest(`https://pimpbunny.com/?page=${page}`, {"User-Agent":"Mozilla/5.0"}); return r.status === 200 ? parseVideosFromHtml(r.body) : []; }
  catch (e) { consoleLog("error", `Homepage failed: ${e.message}`); return []; }
}

async function getSearchSuggestions(searchString) { return []; }

async function getSearchResults(request, page) {
  try {
    const query = encodeURIComponent((request && request.searchString) || "");
    const r = await httpRequest(`https://pimpbunny.com/search?q=${query}&page=${page}`, {"User-Agent":"Mozilla/5.0"});
    return r.status === 200 ? parseVideosFromHtml(r.body) : [];
  } catch (e) { consoleLog("error", `Search failed: ${e.message}`); return []; }
}

function getVideoUriFromID(videoID) { return `https://pimpbunny.com/videos/${encodeURIComponent(videoID)}`; }
function getAuthorUriFromID(authorID) { return `https://pimpbunny.com/onlyfans-creators/${encodeURIComponent(authorID)}`; }

async function getVideoMetadata(videoId, uvp) {
  try {
    const r = await httpRequest(getVideoUriFromID(videoId), {"User-Agent":"Mozilla/5.0"});
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const html = r.body, titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const m3u8 = {}, streams = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi) || [];
    streams.forEach((url, index) => { m3u8[String(index)] = url; });
    const author = html.match(/\/onlyfans-creators\/([^"'/?#]+)/i);
    return {
      iD: videoId, m3u8Uris: m3u8, playbackHttpHeaders: {"Referer":"https://pimpbunny.com/"},
      title: cleanText(titleMatch ? titleMatch[1] : videoId), universalVideoPreview: uvp || {},
      authorID: author ? author[1] : "", authorName: null, authorSubscriberCount: 0, authorAvatar: null,
      actors: [], description: null, viewsTotal: 0, tags: [], categories: [], uploadDate: null,
      ratingsPositiveTotal: 0, ratingsNegativeTotal: 0, ratingsTotal: 0, virtualReality: false,
      chapters: {}, rawHtml: html
    };
  } catch (e) { consoleLog("error", `Video metadata failed: ${e.message}`); throw e; }
}

async function downloadThumbnail(uri, headers) {
  try { const r = await httpRequest(uri, headers || {}); return r.status === 200 ? decodeBase64ToBytes(r.bodyBase64) : []; }
  catch (_) { return []; }
}

async function getProgressThumbnails(videoID, rawHtml) { return []; }
function cancelGetProgressThumbnails() {}
function getCommentUriFromID(commentID, videoID) { return `${getVideoUriFromID(videoID)}#comment-${commentID}`; }
async function getComments(videoID, rawHtml, page) { return []; }
async function getVideoSuggestions(videoID, rawHtml, page) { return []; }
async function getAuthorPage(authorID) {
  const r = await httpRequest(getAuthorUriFromID(authorID), {"User-Agent":"Mozilla/5.0"});
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const title = r.body.match(/<h[12]\b[^>]*>([\s\S]*?)<\//i);
  return { iD: authorID, name: cleanText(title ? title[1] : authorID), avatar: null, banner: null,
    aliases: [], description: null, advancedDescription: {}, externalLinks: {}, viewsTotal: 0,
    videosTotal: 0, subscribers: 0, rank: 0, rawHtml: r.body };
}
async function getAuthorVideos(authorID, page) {
  const r = await httpRequest(`${getAuthorUriFromID(authorID)}?page=${page}`, {"User-Agent":"Mozilla/5.0"});
  return r.status === 200 ? parseVideosFromHtml(r.body) : [];
}
