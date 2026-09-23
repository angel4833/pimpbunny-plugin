// Compatibility fixes for current PimpBunny markup and Hedon Haven URLs.
// This file is intentionally loaded after main.js by compile.sh, so these
// declarations replace the older brittle implementations in main.js.

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function firstAttr(markup, tag, attribute) {
  const expression = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, "i");
  const match = String(markup || "").match(expression);
  return match ? htmlDecode(match[1]) : "";
}

function textFromMarkup(markup) {
  return htmlDecode(String(markup || "").replace(/<[^>]+>/g, " "))
    .replace(/\\s+/g, " ")
    .trim();
}

function parseVideosFromHtml(htmlBody) {
  const html = String(htmlBody || "");
  const videos = [];
  const seen = new Set();
  // Do not depend on CSS class names: the site has changed its card classes
  // several times. Every /videos/<id> link is enough to identify a result.
  const linkPattern = /<a\\b[^>]*\\bhref=["'](?:https?:\\/\\/pimpbunny\\.com)?\\/videos\\/([^"'?#/]+)[^"']*["'][^>]*>[\\s\\S]*?<\\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const videoId = htmlDecode(match[1]);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    // Inspect the surrounding card, but fall back to the link itself.
    const start = Math.max(0, match.index - 2500);
    const end = Math.min(html.length, linkPattern.lastIndex + 2500);
    const card = html.slice(start, end);
    const title = textFromMarkup(
      (card.match(/<(?:h[1-6]|div|span|p)\\b[^>]*\\b(?:title|name|video-title|card-title)[^>]*>([\\s\\S]*?)<\\/(?:h[1-6]|div|span|p)>/i) || [])[1] || match[0]
    ) || videoId;
    const thumbnail = firstAttr(card, "img", "src") || firstAttr(card, "source", "src");
    const authorMatch = card.match(/\\/onlyfans-creators\\/([^"'?#/]+)/i);
    const durationText = ((card.match(/\\b(\\d{1,2}:\\d{2}(?::\\d{2})?)\\b/) || [])[1] || "");
    const durationParts = durationText.split(":").map(Number);
    const duration = durationParts.length === 3
      ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
      : durationParts.length === 2 ? durationParts[0] * 60 + durationParts[1] : 0;

    videos.push({
      iD: videoId,
      title,
      previewThumbnailUrl: thumbnail,
      duration,
      authorID: authorMatch ? htmlDecode(authorMatch[1]) : "",
      authorName: "",
      viewsTotal: 0,
      uploadDate: Math.floor(Date.now() / 1000),
    });
  }
  consoleLog("info", `Parsed ${videos.length} videos from HTML`);
  return videos;
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    const response = await httpRequest(uri, thumbnailHttpHeaders || {});
    if (response.status !== 200) return "";
    // Binary data must remain base64; response.body is decoded UTF-8 text.
    return response.bodyBase64 || response.body || "";
  } catch (error) {
    consoleLog("error", `Error downloading thumbnail: ${error.message}`);
    return "";
  }
}

async function parseExternalLink(uriString) {
  try {
    const url = new URL(uriString);
    const args = Object.fromEntries(url.searchParams.entries());
    const page = Number.parseInt(args.page || "0", 10) || 0;
    if (url.pathname === "/" || url.pathname === "/home") return { type: "homePage", pageCount: page };
    if (url.pathname === "/search") {
      return {
        type: "searchResultsPage",
        searchRequest: {
          searchString: args.query || args.q || "",
          sortingType: args.sortingType || null,
          dateRange: args.dateRange || null,
          minQuality: null, maxQuality: null, minDuration: null, maxDuration: null,
        },
        pageCount: page,
      };
    }
    if (url.pathname === "/video") return { type: "videoPage", iD: args.videoId || args.id || "" };
    if (url.pathname === "/author") return { type: "authorPage", iD: args.authorId || args.id || "" };
    return { type: "unknown" };
  } catch (error) {
    consoleLog("error", `Error parsing link: ${error.message}`);
    return { type: "unknown" };
  }
}
