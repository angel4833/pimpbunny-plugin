async function init() {
  consoleLog("info", "PimpBunny plugin initialized successfully");
  return true;
}

async function parseExternalLink(uriString) {
  try {
    const url = new URL(uriString);
    const args = Object.fromEntries(url.searchParams.entries());

    switch (url.pathname) {
      case "/home":
        return {
          type: "homePage",
          pageCount: parseInt(args["page"] ?? "0", 10),
        };

      case "/search":
        return {
          type: "searchResultsPage",
          searchRequest: {
            searchString: decodeURIComponent(args["query"] ?? ""),
            sortingType: args["sortingType"] ?? null,
            dateRange: args["dateRange"] ?? null,
            minQuality: args["minQuality"] ? parseInt(args["minQuality"], 10) : null,
            maxQuality: args["maxQuality"] ? parseInt(args["maxQuality"], 10) : null,
            minDuration: args["minDuration"] ? parseInt(args["minDuration"], 10) : null,
            maxDuration: args["maxDuration"] ? parseInt(args["maxDuration"], 10) : null,
          },
          pageCount: parseInt(args["page"] ?? "0", 10),
        };

      case "/video":
        return {
          type: "videoPage",
          iD: args["videoId"],
        };

      case "/author":
        return {
          type: "authorPage",
          iD: args["authorId"],
        };

      default:
        return { type: "unknown" };
    }
  } catch (e) {
    consoleLog("error", `Error parsing link: ${e.message}`);
    return { type: "unknown" };
  }
}

async function runFunctionalityTest() {
  consoleLog("info", "Running PimpBunny plugin functionality test");
  try {
    const response = await httpRequest("https://pimpbunny.com/", {});
    if (response.status === 200) {
      consoleLog("info", "Successfully connected to PimpBunny");
      return true;
    } else {
      consoleLog("warning", `PimpBunny returned status ${response.status}`);
      return false;
    }
  } catch (e) {
    consoleLog("error", `Functionality test failed: ${e.message}`);
    return false;
  }
}

async function getHomePage(page) {
  try {
    consoleLog("info", `Fetching homepage - page ${page}`);
    const response = await httpRequest(`https://pimpbunny.com/?page=${page}`, {});
    
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch homepage: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromHtml(response.body);
    consoleLog("info", `Found ${videos.length} videos on homepage`);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching homepage: ${e.message}`);
    return [];
  }
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    const response = await httpRequest(uri, thumbnailHttpHeaders || {});
    if (response.status === 200) {
      return response.body;
    } else {
      consoleLog("error", `Error downloading thumbnail: ${response.status}`);
      return "";
    }
  } catch (e) {
    consoleLog("error", `Error downloading thumbnail: ${e}`);
    return "";
  }
}

async function getSearchSuggestions(searchString) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/search?q=${encodeURIComponent(searchString)}`, {});
    if (response.status === 200) {
      const suggestions = extractSearchSuggestions(response.body);
      return suggestions.slice(0, 10);
    }
    return [];
  } catch (e) {
    consoleLog("warning", `Error fetching search suggestions: ${e.message}`);
    return [];
  }
}

async function getSearchResults(request, page) {
  try {
    const searchQuery = encodeURIComponent(request.searchString);
    consoleLog("info", `Searching for: ${request.searchString} - page ${page}`);
    
    const response = await httpRequest(`https://pimpbunny.com/search?q=${searchQuery}&page=${page}`, {});
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch search results: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromHtml(response.body);
    consoleLog("info", `Found ${videos.length} search results`);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching search results: ${e.message}`);
    return [];
  }
}

function getVideoUriFromID(videoID) {
  return `https://pimpbunny.com/videos/${videoID}`;
}

async function getVideoMetadata(videoId, uvp) {
  try {
    consoleLog("info", `Fetching video metadata for: ${videoId}`);
    const response = await httpRequest(`https://pimpbunny.com/videos/${videoId}`, {});
    
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch video: ${response.status}`);
      return null;
    }

    const videoData = extractVideoMetadata(response.body, videoId);
    return videoData;
  } catch (e) {
    consoleLog("error", `Error fetching video metadata: ${e.message}`);
    return null;
  }
}

async function getProgressThumbnails(videoID, rawHtml) {
  try {
    consoleLog("info", `Fetching progress thumbnails for: ${videoID}`);
    const thumbnails = extractProgressThumbnails(rawHtml);
    return thumbnails;
  } catch (e) {
    consoleLog("error", `Error fetching progress thumbnails: ${e.message}`);
    return [];
  }
}

function cancelGetProgressThumbnails() {
  consoleLog("info", "Progress thumbnails fetch cancelled");
}

function getCommentUriFromID(commentID, videoID) {
  return `https://pimpbunny.com/videos/${videoID}#comment-${commentID}`;
}

async function getComments(videoID, rawHtml, page) {
  try {
    consoleLog("info", `Fetching comments for video ${videoID} - page ${page}`);
    const comments = extractComments(rawHtml, page);
    return comments;
  } catch (e) {
    consoleLog("error", `Error fetching comments: ${e.message}`);
    return [];
  }
}

async function getVideoSuggestions(videoID, rawHtml, page) {
  try {
    consoleLog("info", `Fetching suggestions for video ${videoID}`);
    const videos = extractSuggestedVideos(rawHtml);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching suggestions: ${e.message}`);
    return [];
  }
}

function getAuthorUriFromID(authorID) {
  return `https://pimpbunny.com/onlyfans-creators/${authorID}`;
}

async function getAuthorPage(authorID) {
  try {
    consoleLog("info", `Fetching author page for: ${authorID}`);
    const response = await httpRequest(`https://pimpbunny.com/onlyfans-creators/${authorID}`, {});
    
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch author page: ${response.status}`);
      return null;
    }

    const authorData = extractAuthorMetadata(response.body, authorID);
    return authorData;
  } catch (e) {
    consoleLog("error", `Error fetching author page: ${e.message}`);
    return null;
  }
}

async function getAuthorVideos(authorID, page) {
  try {
    consoleLog("info", `Fetching videos for author ${authorID} - page ${page}`);
    const response = await httpRequest(`https://pimpbunny.com/onlyfans-creators/${authorID}?page=${page}`, {});
    
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch author videos: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromHtml(response.body);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching author videos: ${e.message}`);
    return [];
  }
}

// ============= HELPER FUNCTIONS =============

function parseVideosFromHtml(htmlBody) {
  try {
    const videos = [];
    
    // Match video cards with class "b6m-video"
    const videoCardPattern = /<div[^>]*class="[^"]*b6m-video[^"]*"[^>]*>[\s\S]*?<a\s+class="ui-heading-root[^>]*><\/a>/g;
    let cardMatch;
    
    while ((cardMatch = videoCardPattern.exec(htmlBody)) !== null) {
      const cardHtml = cardMatch[0];
      
      // Extract video URL and ID from href
      const hrefMatch = cardHtml.match(/<a[^>]*class="ui-card-link[^"]*"[^>]*href="https:\/\/pimpbunny\.com\/videos\/([^"]+)"/);
      if (!hrefMatch) continue;
      
      const videoId = hrefMatch[1];
      
      // Extract title
      const titleMatch = cardHtml.match(/<div[^>]*class="[^"]*ui-card-title[^"]*"[^>]*>([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";
      
      // Extract thumbnail URL
      const thumbnailMatch = cardHtml.match(/<img[^>]*class="[^"]*ui-card-thumbnail[^"]*"[^>]*src="([^"]*)"[^>]*>/);
      const thumbnail = thumbnailMatch ? thumbnailMatch[1] : "";
      
      // Extract duration - look for ui-card-duration
      const durationMatch = cardHtml.match(/<div[^>]*class="[^"]*ui-card-duration[^"]*"[^>]*>([^<]+)<\/div>/);
      let duration = 0;
      if (durationMatch) {
        const durationStr = durationMatch[1].trim();
        const parts = durationStr.split(':');
        if (parts.length === 2) {
          duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }
      
      // Extract author name - look for ui-card-related-models link
      const authorMatch = cardHtml.match(/<a[^>]*class="accent"[^>]*href="https:\/\/pimpbunny\.com\/onlyfans-creators\/([^"\/]+)[^"]*"[^>]*><span[^>]*class="[^"]*text-truncate[^"]*"[^>]*>([^<]+)<\/span><\/a>/);
      const authorId = authorMatch ? authorMatch[1] : "unknown";
      const authorName = authorMatch ? authorMatch[2].trim() : "Unknown";
      
      // Extract views - look for SVG with view icon followed by span
      const viewsMatch = cardHtml.match(/<svg[^>]*width="18"[^>]*height="18"[\s\S]*?<\/svg>\s*<span>([^<]+)<\/span>/);
      let views = 0;
      if (viewsMatch) {
        const viewsStr = viewsMatch[1].trim().replace('K', '000').replace('M', '000000');
        views = parseInt(viewsStr) || 0;
      }
      
      // Extract likes - look for positive class span
      const likesMatch = cardHtml.match(/<div[^>]*class="positive"[\s\S]*?<span>([^<]+)<\/span>/);
      const likes = likesMatch ? parseInt(likesMatch[1]) : 0;
      
      const uploadDate = Math.floor(Date.now() / 1000);
      
      if (videoId) {
        videos.push({
          iD: videoId,
          title: title,
          previewThumbnailUrl: thumbnail,
          duration: duration,
          authorID: authorId,
          authorName: authorName,
          viewsTotal: views,
          uploadDate: uploadDate,
        });
      }
    }
    
    consoleLog("info", `Parsed ${videos.length} videos from HTML`);
    return videos;
  } catch (e) {
    consoleLog("error", `Error parsing videos: ${e.message}`);
    return [];
  }
}

function extractVideoMetadata(html, videoId) {
  try {
    const metadata = {
      iD: videoId,
      m3u8Uris: {},
      title: "",
      universalVideoPreview: "",
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
      rawHtml: html,
    };
    
    // Extract title from h1
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
    
    // Extract views
    const viewsMatch = html.match(/(\d+(?:,\d+)*)\s*(?:views?|vistas)/i);
    if (viewsMatch) {
      metadata.viewsTotal = parseInt(viewsMatch[1].replace(/,/g, ""));
    }
    
    // Extract author info
    const authorMatch = html.match(/<a[^>]*href="https:\/\/pimpbunny\.com\/onlyfans-creators\/([^"\/]+)[^"]*"[^>]*>([^<]+)<\/a>/);
    if (authorMatch) {
      metadata.authorID = authorMatch[1];
      metadata.authorName = authorMatch[2].trim();
    }
    
    // Extract description
    const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/div>/);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }
    
    // Extract video sources (m3u8)
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8/gi);
    if (m3u8Match) {
      metadata.m3u8Uris[m3u8Match[0]] = m3u8Match[0];
    }
    
    // Extract likes
    const likesMatch = html.match(/<div[^>]*class="positive"[\s\S]*?<span>(\d+)<\/span>/);
    if (likesMatch) {
      metadata.ratingsPositiveTotal = parseInt(likesMatch[1]);
    }
    
    return metadata;
  } catch (e) {
    consoleLog("error", `Error extracting video metadata: ${e.message}`);
    return null;
  }
}

function extractComments(html, page) {
  try {
    const comments = [];
    const commentPattern = /<div[^>]*class="[^"]*comment[^"]*"[^>]*>/gi;
    let match;
    let index = 0;
    
    while ((match = commentPattern.exec(html)) !== null && index < 10) {
      const commentHtml = html.substring(match.index, match.index + 1000);
      
      const authorMatch = commentHtml.match(/<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/);
      const textMatch = commentHtml.match(/<p[^>]*class="[^"]*text[^"]*"[^>]*>([^<]+)<\/p>/);
      
      if (authorMatch && textMatch) {
        comments.push({
          iD: `comment-${page}-${index}`,
          authorID: "unknown",
          authorName: authorMatch[1].trim(),
          authorAvatar: "",
          message: textMatch[1].trim(),
          uploadDate: Math.floor(Date.now() / 1000),
          likes: 0,
        });
      }
      index++;
    }
    
    return comments;
  } catch (e) {
    consoleLog("error", `Error extracting comments: ${e.message}`);
    return [];
  }
}

function extractSuggestedVideos(html) {
  try {
    const videos = [];
    const suggestionPattern = /<div[^>]*class="[^"]*b6m-video[^"]*"[^>]*>/gi;
    let match;
    let index = 0;
    
    while ((match = suggestionPattern.exec(html)) !== null && index < 20) {
      index++;
    }
    
    return videos;
  } catch (e) {
    consoleLog("error", `Error extracting suggested videos: ${e.message}`);
    return [];
  }
}

function extractProgressThumbnails(html) {
  try {
    const thumbnails = [];
    const pattern = /https?:\/\/[^\s"'<>]+\.jpg/gi;
    const matches = html.match(pattern);
    
    if (matches) {
      for (let i = 0; i < Math.min(matches.length, 10); i++) {
        thumbnails.push({
          url: matches[i],
          time: Math.floor((i / Math.min(matches.length, 10)) * 3600),
        });
      }
    }
    
    return thumbnails;
  } catch (e) {
    consoleLog("error", `Error extracting progress thumbnails: ${e.message}`);
    return [];
  }
}

function extractSearchSuggestions(html) {
  try {
    const suggestions = [];
    const pattern = /<li[^>]*class="[^"]*suggestion[^"]*"[^>]*>([^<]+)<\/li>/gi;
    let match;
    
    while ((match = pattern.exec(html)) !== null && suggestions.length < 10) {
      suggestions.push(match[1].trim());
    }
    
    return suggestions;
  } catch (e) {
    consoleLog("error", `Error extracting search suggestions: ${e.message}`);
    return [];
  }
}

function extractAuthorMetadata(html, authorId) {
  try {
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
      rawHtml: html,
    };
    
    // Extract name from h1 or h2
    const nameMatch = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/);
    if (nameMatch) {
      metadata.name = nameMatch[1].trim();
    }
    
    // Extract avatar
    const avatarMatch = html.match(/<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]*)"[^>]*>/);
    if (avatarMatch) {
      metadata.avatar = avatarMatch[1];
    }
    
    // Extract banner
    const bannerMatch = html.match(/<img[^>]*class="[^"]*banner[^"]*"[^>]*src="([^"]*)"[^>]*>/);
    if (bannerMatch) {
      metadata.banner = bannerMatch[1];
    }
    
    // Extract subscriber count
    const subMatch = html.match(/(\d+(?:,\d+)*)\s*(?:subscriber|follower)s?/i);
    if (subMatch) {
      metadata.subscribers = parseInt(subMatch[1].replace(/,/g, ""));
    }
    
    // Extract video count
    const videoCountMatch = html.match(/(\d+(?:,\d+)*)\s*videos?/i);
    if (videoCountMatch) {
      metadata.videosTotal = parseInt(videoCountMatch[1].replace(/,/g, ""));
    }
    
    // Extract views
    const viewsMatch = html.match(/(\d+(?:,\d+)*)\s*(?:views?|vistas)/i);
    if (viewsMatch) {
      metadata.viewsTotal = parseInt(viewsMatch[1].replace(/,/g, ""));
    }
    
    // Extract description
    const descMatch = html.match(/<div[^>]*class="[^"]*bio[^"]*"[^>]*>([^<]+)<\/div>/);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }
    
    return metadata;
  } catch (e) {
    consoleLog("error", `Error extracting author metadata: ${e.message}`);
    return null;
  }
}
