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
    // Test HTTP request
    const response = await httpRequest("https://pimpbunny.com");
    if (response.status === 200) {
      consoleLog("info", "Successfully connected to PimpBunny");
    } else {
      consoleLog("warning", `PimpBunny returned status ${response.status}`);
    }
  } catch (e) {
    consoleLog("error", `Functionality test failed: ${e.message}`);
    return false;
  }
  return true;
}

async function getHomePage(page) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/?page=${page}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch homepage: ${response.status}`);
      return [];
    }

    // Parse the HTML response
    const videos = parseVideosFromHtml(response.body, page);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching homepage: ${e.message}`);
    return [];
  }
}

async function downloadThumbnail(uri, thumbnailHttpHeaders) {
  try {
    const response = await httpRequest(uri, thumbnailHttpHeaders);
    if (response.status === 200) {
      return response.body; // base64 encoded bytes
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
    const response = await httpRequest(`https://pimpbunny.com/api/search/suggestions?q=${encodeURIComponent(searchString)}`);
    if (response.status === 200) {
      const data = JSON.parse(response.body);
      return data.suggestions || [];
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
    const response = await httpRequest(`https://pimpbunny.com/search?q=${searchQuery}&page=${page}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch search results: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromHtml(response.body, page);
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
    const response = await httpRequest(`https://pimpbunny.com/api/video/${videoId}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch video metadata: ${response.status}`);
      return null;
    }

    const data = JSON.parse(response.body);
    return {
      iD: videoId,
      m3u8Uris: data.m3u8Uris || {},
      title: data.title || "Untitled",
      universalVideoPreview: uvp,
      authorID: data.authorId,
      authorName: data.authorName,
      authorSubscriberCount: data.subscribers || 0,
      authorAvatar: data.authorAvatar,
      actors: data.actors || [],
      description: data.description || "",
      viewsTotal: data.views || 0,
      tags: data.tags || [],
      categories: data.categories || [],
      uploadDate: data.uploadDate || Math.floor(Date.now() / 1000),
      ratingsPositiveTotal: data.likes || 0,
      ratingsNegativeTotal: data.dislikes || 0,
      ratingsTotal: (data.likes || 0) + (data.dislikes || 0),
      virtualReality: data.vr || false,
      chapters: data.chapters || {},
      rawHtml: data.html || null,
    };
  } catch (e) {
    consoleLog("error", `Error fetching video metadata: ${e.message}`);
    return null;
  }
}

async function getProgressThumbnails(videoID, rawHtml) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/api/video/${videoID}/thumbnails`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch progress thumbnails: ${response.status}`);
      return [];
    }

    const data = JSON.parse(response.body);
    return data.thumbnails || [];
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
    const response = await httpRequest(`https://pimpbunny.com/api/video/${videoID}/comments?page=${page}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch comments: ${response.status}`);
      return [];
    }

    const data = JSON.parse(response.body);
    return data.comments || [];
  } catch (e) {
    consoleLog("error", `Error fetching comments: ${e.message}`);
    return [];
  }
}

async function getVideoSuggestions(videoID, rawHtml, page) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/api/video/${videoID}/suggestions?page=${page}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch suggestions: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromJson(response.body);
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
    const response = await httpRequest(`https://pimpbunny.com/api/author/${authorID}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch author page: ${response.status}`);
      return null;
    }

    const data = JSON.parse(response.body);
    return {
      iD: authorID,
      name: data.name || "Unknown",
      avatar: data.avatar,
      banner: data.banner,
      aliases: data.aliases || [],
      description: data.description || "",
      advancedDescription: data.advancedDescription || {},
      externalLinks: data.externalLinks || {},
      viewsTotal: data.views || 0,
      videosTotal: data.videosCount || 0,
      subscribers: data.subscribers || 0,
      rank: data.rank || 0,
      rawHtml: data.html || "",
    };
  } catch (e) {
    consoleLog("error", `Error fetching author page: ${e.message}`);
    return null;
  }
}

async function getAuthorVideos(authorID, page) {
  try {
    const response = await httpRequest(`https://pimpbunny.com/api/author/${authorID}/videos?page=${page}`);
    if (response.status !== 200) {
      consoleLog("error", `Failed to fetch author videos: ${response.status}`);
      return [];
    }

    const videos = parseVideosFromJson(response.body);
    return videos;
  } catch (e) {
    consoleLog("error", `Error fetching author videos: ${e.message}`);
    return [];
  }
}

// Helper functions
function parseVideosFromHtml(htmlBody, page) {
  try {
    // Decode base64 if needed
    let html = htmlBody;
    if (typeof htmlBody === 'string' && htmlBody.includes('base64')) {
      html = atob(htmlBody);
    }
    
    // Basic HTML parsing - in production, use proper HTML parsing
    const videos = [];
    // TODO: Implement actual HTML parsing for PimpBunny
    consoleLog("info", `Parsed videos from page ${page}`);
    return videos;
  } catch (e) {
    consoleLog("error", `Error parsing HTML: ${e.message}`);
    return [];
  }
}

function parseVideosFromJson(jsonBody) {
  try {
    const data = JSON.parse(jsonBody);
    return data.videos || [];
  } catch (e) {
    consoleLog("error", `Error parsing JSON: ${e.message}`);
    return [];
  }
}
