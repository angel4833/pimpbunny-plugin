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
  return `https://pimpbunny.com/video/${videoID}`;
}

async function getVideoMetadata(videoId, uvp) {
  try {
    consoleLog("info", `Fetching video metadata for: ${videoId}`);
    const response = await httpRequest(`https://pimpbunny.com/video/${videoId}`, {});
    
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
  return `https://pimpbunny.com/video/${videoID}#comment-${commentID}`;
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
  return `https://pimpbunny.com/author/${authorID}`;
}

async function getAuthorPage(authorID) {
  try {
    consoleLog("info", `Fetching author page for: ${authorID}`);
    const response = await httpRequest(`https://pimpbunny.com/author/${authorID}`, {});
    
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
    const response = await httpRequest(`https://pimpbunny.com/author/${authorID}?page=${page}`, {});
    
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

function extractTextBetween(html, startTag, endTag) {
  try {
    const startIndex = html.indexOf(startTag);
    if (startIndex === -1) return "";
    
    const endIndex = html.indexOf(endTag, startIndex + startTag.length);
    if (endIndex === -1) return "";
    
    return html.substring(startIndex + startTag.length, endIndex).trim();
  } catch (e) {
    return "";
  }
}

function parseVideosFromHtml(htmlBody) {
  try {
    const videos = [];
    
    // Extract video containers - adjust selectors based on actual HTML structure
    const videoPattern = /<div[^>]*class="[^"]*video[^"]*"[^>]*data-id="([^"]*)"[^>]*>/gi;
    let match;
    
    while ((match = videoPattern.exec(htmlBody)) !== null) {
      const videoId = match[1];
      
      // Extract title
      const titleMatch = htmlBody.substring(match.index, match.index + 2000).match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";
      
      // Extract thumbnail
      const thumbnailMatch = htmlBody.substring(match.index, match.index + 2000).match(/<img[^>]*src="([^"]*)"[^>]*>/);
      const thumbnail = thumbnailMatch ? thumbnailMatch[1] : "";
      
      // Extract duration
      const durationMatch = htmlBody.substring(match.index, match.index + 2000).match(/duration[">:]*(\d+):(\d+)/i);
      let duration = 0;
      if (durationMatch) {
        duration = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
      }
      
      // Extract author
      const authorMatch = htmlBody.substring(match.index, match.index + 2000).match(/<a[^>]*href="\/author\/([^"]*)"[^>]*>([^<]+)<\/a>/);
      const authorId = authorMatch ? authorMatch[1] : "unknown";
      const authorName = authorMatch ? authorMatch[2].trim() : "Unknown";
      
      // Extract views
      const viewsMatch = htmlBody.substring(match.index, match.index + 2000).match(/(\d+(?:,\d+)*)\s*(?:views?|vistas)/i);
      const views = viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, "")) : 0;
      
      if (videoId) {
        videos.push({
          iD: videoId,
          title: title,
          previewThumbnailUrl: thumbnail,
          duration: duration,
          authorID: authorId,
          authorName: authorName,
          viewsTotal: views,
          uploadDate: Math.floor(Date.now() / 1000),
        });
      }
    }
    
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
      title: extractTextBetween(html, "<h1", "</h1>") || "Untitled",
      universalVideoPreview: "",
      authorID: "",
      authorName: "",
      authorSubscriberCount: 0,
      authorAvatar: "",
      actors: [],
      description: extractTextBetween(html, 'class="description"', "</div>") || "",
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
    
    // Extract views
    const viewsMatch = html.match(/(\d+(?:,\d+)*)\s*(?:views?|vistas)/i);
    if (viewsMatch) {
      metadata.viewsTotal = parseInt(viewsMatch[1].replace(/,/g, ""));
    }
    
    // Extract author info
    const authorMatch = html.match(/<a[^>]*href="\/author\/([^"]*)"[^>]*>([^<]+)<\/a>/);
    if (authorMatch) {
      metadata.authorID = authorMatch[1];
      metadata.authorName = authorMatch[2].trim();
    }
    
    // Extract tags
    const tagsMatch = html.match(/<span[^>]*class="tag"[^>]*>([^<]+)<\/span>/g);
    if (tagsMatch) {
      metadata.tags = tagsMatch.map(tag => extractTextBetween(tag, ">", "<"));
    }
    
    // Extract video sources
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8/gi);
    if (m3u8Match) {
      metadata.m3u8Uris[m3u8Match[0]] = m3u8Match[0];
    }
    
    // Extract likes
    const likesMatch = html.match(/(\d+(?:,\d+)*)\s*(?:like|likes|me gusta)/i);
    if (likesMatch) {
      metadata.ratingsPositiveTotal = parseInt(likesMatch[1].replace(/,/g, ""));
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
    const commentPattern = /<div[^>]*class="comment"[^>]*>/gi;
    let match;
    let index = 0;
    
    while ((match = commentPattern.exec(html)) !== null && index < 10) {
      const commentHtml = html.substring(match.index, match.index + 1000);
      
      const authorMatch = commentHtml.match(/<span[^>]*class="author"[^>]*>([^<]+)<\/span>/);
      const textMatch = commentHtml.match(/<p[^>]*class="text"[^>]*>([^<]+)<\/p>/);
      const dateMatch = commentHtml.match(/(\d+\s*(?:minute|hour|day|week|month|year)s?\s*ago)/i);
      
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
    const suggestionPattern = /<div[^>]*class="suggestion"[^>]*data-id="([^"]*)"[^>]*>/gi;
    let match;
    let index = 0;
    
    while ((match = suggestionPattern.exec(html)) !== null && index < 20) {
      const videoId = match[1];
      const videoHtml = html.substring(match.index, match.index + 1000);
      
      const titleMatch = videoHtml.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/);
      const thumbnailMatch = videoHtml.match(/<img[^>]*src="([^"]*)"[^>]*>/);
      
      if (videoId && titleMatch) {
        videos.push({
          iD: videoId,
          title: titleMatch[1].trim(),
          previewThumbnailUrl: thumbnailMatch ? thumbnailMatch[1] : "",
          duration: 0,
          authorID: "unknown",
          authorName: "Unknown",
          viewsTotal: 0,
          uploadDate: Math.floor(Date.now() / 1000),
        });
      }
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
    const pattern = /<li[^>]*class="suggestion"[^>]*>([^<]+)<\/li>/gi;
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
      name: extractTextBetween(html, "<h1", "</h1>") || "Unknown",
      avatar: "",
      banner: "",
      aliases: [],
      description: extractTextBetween(html, 'class="bio"', "</div>") || "",
      advancedDescription: {},
      externalLinks: {},
      viewsTotal: 0,
      videosTotal: 0,
      subscribers: 0,
      rank: 0,
      rawHtml: html,
    };
    
    // Extract avatar
    const avatarMatch = html.match(/<img[^>]*class="avatar"[^>]*src="([^"]*)"[^>]*>/);
    if (avatarMatch) {
      metadata.avatar = avatarMatch[1];
    }
    
    // Extract banner
    const bannerMatch = html.match(/<img[^>]*class="banner"[^>]*src="([^"]*)"[^>]*>/);
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
    
    return metadata;
  } catch (e) {
    consoleLog("error", `Error extracting author metadata: ${e.message}`);
    return null;
  }
}
