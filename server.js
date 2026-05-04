import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(appRoot, "public");
const resourcesRoot = path.join(appRoot, "resources");
const coursesRoot = path.join(resourcesRoot, "courses");
const tutorialsRoot = path.join(resourcesRoot, "tutorials");
const port = Number(process.env.PORT || process.argv[2] || 5177);
const host = process.env.HOST || "127.0.0.1";

const authUser = process.env.LEARN_USERNAME || "bookm";
const authPassword = process.env.LEARN_PASSWORD || "learn-local";
const cookieSecure = process.env.COOKIE_SECURE === "true";
const sessionCookie = "lp_session";
const sessionTtlMs = Number(process.env.SESSION_TTL_HOURS || 168) * 60 * 60 * 1000;
const sessions = new Map();

const videoExts = new Set([".mp4", ".m4v", ".webm", ".mkv", ".mov"]);
const captionExts = new Set([".srt", ".vtt"]);
const tutorialExts = new Set([".md", ".markdown", ".html", ".htm"]);
const resourceExts = new Set([
  ".html",
  ".htm",
  ".pdf",
  ".zip",
  ".sql",
  ".txt",
  ".csv",
  ".json",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".markdown", "text/markdown; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".mkv", "video/x-matroska"],
  [".mov", "video/quicktime"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".srt", "application/x-subrip; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"],
  [".sql", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
]);

createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD", "POST"].includes(req.method || "")) {
      sendText(res, 405, "Method not allowed");
      return;
    }

    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/login" || pathname === "/login.html") {
      if (isAuthenticated(req)) {
        sendRedirect(res, "/");
        return;
      }
      await serveFile(req, res, publicRoot, "login.html", { download: false });
      return;
    }

    if (pathname === "/styles.css") {
      await serveFile(req, res, publicRoot, "styles.css", { download: false });
      return;
    }

    if (pathname === "/auth/login" && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (pathname === "/auth/logout" && req.method === "POST") {
      handleLogout(req, res);
      return;
    }

    if (!isAuthenticated(req)) {
      requireLogin(req, res);
      return;
    }

    if (pathname === "/auth/status") {
      sendJson(res, { authenticated: true, user: authUser });
      return;
    }

    if (pathname === "/api/library") {
      sendJson(res, await scanLibrary());
      return;
    }

    if (pathname === "/api/course") {
      sendJson(res, await scanLibrary());
      return;
    }

    if (pathname.startsWith("/api/transcript/")) {
      await sendTranscript(res, routeRemainder(pathname, "/api/transcript/"));
      return;
    }

    if (pathname.startsWith("/caption/")) {
      await sendCaption(res, routeRemainder(pathname, "/caption/"));
      return;
    }

    if (pathname.startsWith("/article/")) {
      await sendArticle(res, routeRemainder(pathname, "/article/"));
      return;
    }

    if (pathname.startsWith("/media/")) {
      await serveFile(req, res, resourcesRoot, routeRemainder(pathname, "/media/"), { download: false });
      return;
    }

    if (pathname.startsWith("/download/")) {
      await serveFile(req, res, resourcesRoot, routeRemainder(pathname, "/download/"), {
        download: true,
      });
      return;
    }

    if (pathname.startsWith("/download-section/")) {
      await sendSectionZip(res, routeRemainder(pathname, "/download-section/"));
      return;
    }

    if (pathname.startsWith("/download-all-resources/")) {
      await sendAllResourcesZip(res, routeRemainder(pathname, "/download-all-resources/"));
      return;
    }

    if (await servePublic(req, res, pathname)) {
      return;
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    sendText(res, error.statusCode || 500, error.message || "Server error");
  }
}).listen(port, host, () => {
  console.log(`Learning platform running at http://${host}:${port}`);
  console.log(`Resources folder: ${resourcesRoot}`);
  if (!process.env.LEARN_PASSWORD) {
    console.log("Using development login: bookm / learn-local");
    console.log("Set LEARN_USERNAME and LEARN_PASSWORD before exposing this.");
  }
});

async function handleLogin(req, res) {
  const body = await readRequestBody(req);
  const contentType = req.headers["content-type"] || "";
  const data = contentType.includes("application/json")
    ? JSON.parse(body || "{}")
    : Object.fromEntries(new URLSearchParams(body));

  if (!safeEqual(data.username || "", authUser) || !safeEqual(data.password || "", authPassword)) {
    sendJson(res, { ok: false, message: "Invalid username or password" }, 401);
    return;
  }

  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, { user: authUser, expiresAt: Date.now() + sessionTtlMs });
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": makeSessionCookie(sessionId),
  });
  res.end(JSON.stringify({ ok: true }));
}

function handleLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies[sessionCookie]) sessions.delete(cookies[sessionCookie]);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": clearSessionCookie(),
  });
  res.end(JSON.stringify({ ok: true }));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = cookies[sessionCookie];
  if (!sessionId) return false;

  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return false;
  }

  session.expiresAt = Date.now() + sessionTtlMs;
  return true;
}

function requireLogin(req, res) {
  const acceptsHtml = (req.headers.accept || "").includes("text/html");
  if (req.method === "GET" && acceptsHtml) {
    sendRedirect(res, "/login");
    return;
  }
  sendJson(res, { ok: false, message: "Login required" }, 401);
}

async function scanLibrary() {
  const items = [];

  for (const folder of await readChildDirs(coursesRoot)) {
    const course = await scanVideoCourse(folder);
    if (course) items.push(course);
  }

  for (const folder of await readChildDirs(tutorialsRoot)) {
    const tutorial = await scanTutorial(folder);
    if (tutorial) items.push(tutorial);
  }

  const counts = items.reduce(
    (acc, item) => {
      acc.items += 1;
      acc.sections += item.counts.sections || 0;
      acc.lessons += item.counts.lessons || 0;
      acc.videos += item.counts.videos || 0;
      acc.captions += item.counts.captions || 0;
      acc.resources += item.counts.resources || 0;
      return acc;
    },
    { items: 0, sections: 0, lessons: 0, videos: 0, captions: 0, resources: 0 }
  );

  return {
    title: "Learning Platform",
    generatedAt: new Date().toISOString(),
    counts,
    items,
  };
}

async function scanVideoCourse(courseFolder) {
  const courseRel = toPosix(path.join("courses", courseFolder));
  const coursePath = path.join(resourcesRoot, courseRel);
  const sectionDirs = (await readChildDirs(coursePath))
    .filter((name) => /^\d+\s+-\s+/.test(name))
    .sort(naturalCompare);

  if (!sectionDirs.length) return null;

  const sections = [];
  let totalVideos = 0;
  let totalCaptions = 0;
  let totalResources = 0;

  for (const sectionFolder of sectionDirs) {
    const parsedSection = parseSectionName(sectionFolder);
    const sectionRel = toPosix(path.join(courseRel, sectionFolder));
    const sectionPath = path.join(resourcesRoot, sectionRel);
    const fileEntries = (await readdir(sectionPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !isIgnored(name))
      .sort(naturalCompare);

    const assets = await Promise.all(
      fileEntries.map((fileName) => makeAsset(toPosix(path.join(sectionRel, fileName))))
    );

    const groups = new Map();
    const unnumberedResources = [];

    for (const asset of assets) {
      if (videoExts.has(asset.ext)) totalVideos += 1;
      if (captionExts.has(asset.ext)) totalCaptions += 1;
      if (isResource(asset)) totalResources += 1;

      if (!asset.number) {
        if (isResource(asset)) unnumberedResources.push(asset);
        continue;
      }

      if (!groups.has(asset.number)) {
        groups.set(asset.number, {
          number: asset.number,
          videos: [],
          captions: [],
          resources: [],
        });
      }

      const group = groups.get(asset.number);
      if (videoExts.has(asset.ext)) group.videos.push(asset);
      else if (captionExts.has(asset.ext)) group.captions.push(asset);
      else if (isResource(asset)) group.resources.push(asset);
    }

    const lectures = [...groups.values()]
      .sort((a, b) => a.number - b.number)
      .map((group) => makeLecture(parsedSection, group))
      .filter(Boolean);

    const sectionResources = assets.filter(isResource);

    sections.push({
      id: base64Url(sectionRel),
      index: parsedSection.index,
      title: parsedSection.title,
      folder: sectionFolder,
      path: sectionRel,
      resourceCount: sectionResources.length,
      resources: sectionResources,
      unnumberedResources,
      lectures,
      downloadUrl: `/download-section/${encodePath(sectionRel)}`,
    });
  }

  const title = await readCourseTitle(coursePath, folderTitle(courseFolder));
  const id = base64Url(`course:${courseFolder}`);
  return {
    id,
    type: "course",
    title,
    folder: courseFolder,
    path: courseRel,
    allResourcesUrl: `/download-all-resources/${id}.zip`,
    counts: {
      sections: sections.length,
      lessons: sections.reduce((sum, section) => sum + section.lectures.length, 0),
      videos: totalVideos,
      captions: totalCaptions,
      resources: totalResources,
    },
    sections,
  };
}

async function scanTutorial(tutorialFolder) {
  const tutorialRel = toPosix(path.join("tutorials", tutorialFolder));
  const tutorialPath = path.join(resourcesRoot, tutorialRel);
  const markdownPath = path.join(tutorialPath, "markdown");
  const hasMarkdown = await directoryExists(markdownPath);
  const scanRel = hasMarkdown ? toPosix(path.join(tutorialRel, "markdown")) : tutorialRel;
  const scanPath = hasMarkdown ? markdownPath : tutorialPath;
  const allowedExts = hasMarkdown ? new Set([".md", ".markdown"]) : tutorialExts;
  const fileEntries = (await readdir(scanPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !isIgnored(name) && allowedExts.has(path.extname(name).toLowerCase()))
    .filter((name) => name.toLowerCase() !== "index.html")
    .sort(naturalCompare);

  if (!fileEntries.length) return null;

  const assets = await Promise.all(
    fileEntries.map((fileName) => makeAsset(toPosix(path.join(scanRel, fileName))))
  );

  const lectures = assets.map((asset, index) => ({
    id: base64Url(asset.path),
    sectionId: base64Url(`${tutorialRel}:articles`),
    sectionIndex: 1,
    number: asset.number ?? index + 1,
    title: asset.title,
    type: "document",
    video: null,
    article: asset,
    caption: null,
    captions: [],
    resources: [],
    resourceCount: 0,
  }));

  const id = base64Url(`tutorial:${tutorialFolder}`);
  return {
    id,
    type: "tutorial",
    title: folderTitle(tutorialFolder),
    folder: tutorialFolder,
    path: tutorialRel,
    allResourcesUrl: null,
    counts: {
      sections: 1,
      lessons: lectures.length,
      videos: 0,
      captions: 0,
      resources: 0,
    },
    sections: [
      {
        id: base64Url(`${tutorialRel}:articles`),
        index: 1,
        title: "Articles",
        folder: tutorialFolder,
        path: tutorialRel,
        resourceCount: 0,
        resources: [],
        unnumberedResources: [],
        lectures,
        downloadUrl: null,
      },
    ],
  };
}

async function makeAsset(relativePath) {
  const absolutePath = path.join(resourcesRoot, relativePath);
  const stats = await stat(absolutePath);
  const ext = path.extname(relativePath).toLowerCase();
  const fileName = path.basename(relativePath);
  const stem = path.basename(fileName, ext);
  const parsed = parseLectureFileName(stem);

  return {
    id: base64Url(relativePath),
    name: fileName,
    title: parsed.title,
    number: parsed.number,
    path: relativePath,
    ext,
    size: stats.size,
    sizeLabel: formatBytes(stats.size),
    mediaUrl: `/media/${encodePath(relativePath)}`,
    articleUrl: `/article/${encodePath(relativePath)}`,
    downloadUrl: `/download/${encodePath(relativePath)}`,
  };
}

function makeLecture(section, group) {
  const videos = group.videos.sort((a, b) => naturalCompare(a.name, b.name));
  const captions = group.captions.sort((a, b) => naturalCompare(a.name, b.name));
  const resources = group.resources.sort((a, b) => naturalCompare(a.name, b.name));
  const htmlResources = resources.filter((asset) => asset.ext === ".html" || asset.ext === ".htm");
  const primaryVideo = videos[0] || null;
  const primaryArticle = !primaryVideo ? htmlResources[0] || null : null;
  const primaryResource = !primaryVideo && !primaryArticle ? resources[0] || null : null;

  if (!primaryVideo && !primaryArticle && !primaryResource) return null;

  const caption = primaryVideo ? chooseCaption(primaryVideo, captions) : null;
  const title = primaryVideo?.title || primaryArticle?.title || primaryResource?.title || `Lesson ${group.number}`;
  const attachedResources = primaryArticle
    ? resources.filter((asset) => asset.path !== primaryArticle.path)
    : resources;
  const idSeed = primaryVideo?.path || primaryArticle?.path || primaryResource?.path;

  return {
    id: base64Url(idSeed),
    sectionId: base64Url(`${String(section.index).padStart(2, "0")} - ${section.title}`),
    sectionIndex: section.index,
    number: group.number,
    title,
    type: primaryVideo ? "video" : primaryArticle ? "article" : "resource",
    video: primaryVideo,
    article: primaryArticle,
    caption,
    captions,
    resources: attachedResources,
    resourceCount: attachedResources.length,
  };
}

function chooseCaption(video, captions) {
  if (!captions.length) return null;
  const videoStem = normalizeStem(path.basename(video.name, video.ext));
  return (
    captions.find((caption) => normalizeStem(path.basename(caption.name, caption.ext)) === videoStem) ||
    captions.find((caption) => normalizeStem(path.basename(caption.name, caption.ext)).startsWith(videoStem)) ||
    captions[0]
  );
}

async function servePublic(req, res, pathname) {
  const relPath = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "app.js", "styles.css"].includes(relPath)) return false;
  await serveFile(req, res, publicRoot, relPath, { download: false });
  return true;
}

async function serveFile(req, res, root, requestedPath, options) {
  const absolutePath = safeResolve(root, requestedPath);
  const stats = await stat(absolutePath);
  if (!stats.isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
  };

  if (options.download) {
    headers["Content-Disposition"] = contentDisposition(path.basename(absolutePath));
  }

  const range = req.headers.range;
  if (range) {
    const parsedRange = parseRange(range, stats.size);
    if (!parsedRange) {
      res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
      res.end();
      return;
    }

    headers["Content-Length"] = parsedRange.end - parsedRange.start + 1;
    headers["Content-Range"] = `bytes ${parsedRange.start}-${parsedRange.end}/${stats.size}`;
    res.writeHead(206, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(absolutePath, parsedRange).pipe(res);
    return;
  }

  headers["Content-Length"] = stats.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(absolutePath).pipe(res);
}

async function sendCaption(res, requestedPath) {
  const absolutePath = safeResolve(resourcesRoot, requestedPath);
  const ext = path.extname(absolutePath).toLowerCase();
  const text = await readFile(absolutePath, "utf8");
  const body = ext === ".srt" ? srtToVtt(text) : text;
  res.writeHead(200, {
    "Content-Type": "text/vtt; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

async function sendArticle(res, requestedPath) {
  const absolutePath = safeResolve(resourcesRoot, requestedPath);
  const ext = path.extname(absolutePath).toLowerCase();
  if (![".html", ".htm", ".md", ".markdown"].includes(ext)) {
    sendText(res, 404, "Article not found");
    return;
  }

  const text = await readFile(absolutePath, "utf8");
  const body =
    ext === ".md" || ext === ".markdown"
      ? wrapMarkdownDocument(text, path.basename(absolutePath, ext))
      : /<html[\s>]/i.test(text)
        ? text
        : wrapArticleFragment(text, path.basename(absolutePath, ext));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

async function sendTranscript(res, requestedPath) {
  const absolutePath = safeResolve(resourcesRoot, requestedPath);
  const ext = path.extname(absolutePath).toLowerCase();
  const text = await readFile(absolutePath, "utf8");
  const cues = ext === ".srt" ? parseSrt(text) : parseVtt(text);
  sendJson(res, cues);
}

async function sendSectionZip(res, sectionRel) {
  const sectionPath = safeResolve(resourcesRoot, sectionRel);
  const stats = await stat(sectionPath);
  if (!stats.isDirectory()) {
    sendText(res, 404, "Section not found");
    return;
  }

  const files = await resourceEntriesForDirectory(sectionRel, path.basename(sectionRel));
  if (!files.length) {
    sendText(res, 404, "No resources in this section");
    return;
  }

  await sendZip(res, `${path.basename(sectionRel)} resources.zip`, files);
}

async function sendAllResourcesZip(res, archiveIdWithExt) {
  const archiveId = archiveIdWithExt.replace(/\.zip$/i, "");
  const library = await scanLibrary();
  const item = library.items.find((candidate) => candidate.id === archiveId);
  if (!item || item.type !== "course") {
    sendText(res, 404, "Course not found");
    return;
  }

  const files = [];
  for (const section of item.sections) {
    files.push(...(await resourceEntriesForDirectory(section.path, toPosix(path.join(item.folder, section.folder)))));
  }

  if (!files.length) {
    sendText(res, 404, "No resources found");
    return;
  }

  await sendZip(res, `${item.title} resources.zip`, files);
}

async function resourceEntriesForDirectory(relativeDir, zipFolder) {
  const directory = path.join(resourcesRoot, relativeDir);
  const fileNames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !isIgnored(name) && resourceExts.has(path.extname(name).toLowerCase()))
    .sort(naturalCompare);

  return fileNames.map((fileName) => ({
    absolutePath: path.join(directory, fileName),
    zipPath: toPosix(path.join(zipFolder, fileName)),
  }));
}

async function sendZip(res, archiveName, entries) {
  const zipBuffer = await buildZip(entries);
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": contentDisposition(archiveName),
    "Content-Length": zipBuffer.length,
  });
  res.end(zipBuffer);
}

async function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = await readFile(entry.absolutePath);
    const stats = await stat(entry.absolutePath);
    const name = Buffer.from(entry.zipPath, "utf8");
    const crc = crc32(data);
    const { dosTime, dosDate } = toDosDateTime(stats.mtime);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, end]);
}

async function readChildDirs(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !isIgnored(name))
      .sort(naturalCompare);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readCourseTitle(coursePath, fallback) {
  try {
    const readme = await readFile(path.join(coursePath, "Readme.txt"), "utf8");
    const firstLine = readme
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine ? firstLine.replace(/^Udemy\s+-\s+/i, "") : fallback;
  } catch {
    return fallback;
  }
}

function parseSectionName(folderName) {
  const match = folderName.match(/^(\d+)\s+-\s+(.+)$/);
  return {
    index: match ? Number(match[1]) : 0,
    title: match ? match[2] : folderName,
  };
}

function parseLectureFileName(stem) {
  const match = stem.match(/^(\d{1,4})[.\s]+(.+)$/);
  return {
    number: match ? Number(match[1]) : null,
    title: (match ? match[2] : stem)
      .replace(/_en$/i, "")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function normalizeStem(stem) {
  return stem.replace(/_en$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isIgnored(name) {
  return name === "node_modules" || name.startsWith(".") || name.startsWith("._");
}

function isResource(asset) {
  return resourceExts.has(asset.ext);
}

function srtToVtt(srt) {
  const normalized = srt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

function wrapArticleFragment(fragment, title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        color: #171a1f;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 17px;
        line-height: 1.6;
        margin: 0;
        padding: 34px;
      }
      main {
        max-width: 880px;
      }
      a {
        color: #0b5f58;
        font-weight: 700;
      }
      code {
        background: #f5f7f9;
        border: 1px solid #d8dee6;
        border-radius: 6px;
        padding: 0.1rem 0.3rem;
      }
      p,
      ul,
      ol {
        margin: 0 0 1rem;
      }
    </style>
  </head>
  <body>
    <main>${fragment}</main>
  </body>
</html>`;
}

function wrapMarkdownDocument(markdown, title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        background: #ffffff;
        color: #171a1f;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 17px;
        line-height: 1.7;
        margin: 0;
      }
      main {
        margin: 0 auto;
        max-width: 940px;
        padding: 42px 34px 64px;
      }
      h1, h2, h3 {
        line-height: 1.2;
      }
      h1 {
        font-size: 40px;
        margin: 0 0 24px;
      }
      h2 {
        border-top: 1px solid #e2e8f0;
        font-size: 28px;
        margin: 38px 0 14px;
        padding-top: 28px;
      }
      h3 {
        font-size: 22px;
        margin: 28px 0 12px;
      }
      p, ul, ol, pre, figure {
        margin: 0 0 18px;
      }
      ul, ol {
        padding-left: 26px;
      }
      li {
        margin: 7px 0;
      }
      a {
        color: #0b5f58;
        font-weight: 700;
      }
      code {
        background: #f5f7f9;
        border: 1px solid #d8dee6;
        border-radius: 6px;
        font-size: 0.9em;
        padding: 0.1rem 0.3rem;
      }
      pre {
        background: #111827;
        border-radius: 8px;
        color: #eef2f7;
        overflow: auto;
        padding: 16px;
      }
      pre code {
        background: transparent;
        border: 0;
        color: inherit;
        padding: 0;
      }
      figure {
        text-align: center;
      }
      img {
        border: 1px solid #d8dee6;
        border-radius: 8px;
        height: auto;
        max-width: 100%;
      }
      figcaption {
        color: #667085;
        font-size: 14px;
        margin-top: 8px;
      }
      blockquote {
        border-left: 4px solid #0f766e;
        color: #475467;
        margin: 0 0 18px;
        padding: 6px 0 6px 16px;
      }
      @media (max-width: 680px) {
        main {
          padding: 28px 18px 48px;
        }
        h1 {
          font-size: 30px;
        }
        h2 {
          font-size: 23px;
        }
      }
    </style>
  </head>
  <body>
    <main>${markdownToHtml(markdown)}</main>
  </body>
</html>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let code = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
    if (image) {
      flushParagraph();
      closeList();
      const alt = image[1].trim();
      const src = image[2].trim();
      html.push(
        `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />${
          alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""
        }</figure>`
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("\n");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

function parseSrt(srt) {
  const normalized = srt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex === -1) return null;
      const [startRaw, endRaw] = lines[timingIndex].split("-->").map((value) => value.trim());
      return {
        start: captionTimeToSeconds(startRaw),
        end: captionTimeToSeconds(endRaw),
        text: lines.slice(timingIndex + 1).join(" ").replace(/<[^>]*>/g, "").trim(),
      };
    })
    .filter((cue) => cue && Number.isFinite(cue.start) && cue.text);
}

function parseVtt(vtt) {
  return parseSrt(
    vtt
      .replace(/^\uFEFF?WEBVTT.*?(\n\n|\r\n\r\n)/s, "")
      .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2")
  );
}

function captionTimeToSeconds(value) {
  const clean = value.split(/\s+/)[0].replace(",", ".");
  const match = clean.match(/(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return Number.NaN;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseRange(rangeHeader, size) {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  let start;
  let end;

  if (match[1] === "" && match[2] === "") return null;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function readRequestBody(req, limit = 1024 * 1024) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
  }
  return body;
}

function safeResolve(root, requestedPath) {
  const decoded = requestedPath.replace(/\\/g, "/");
  const resolved = path.resolve(root, decoded);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSeparator)) {
    const error = new Error("Invalid path");
    error.statusCode = 400;
    throw error;
  }
  return resolved;
}

function routeRemainder(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length));
}

function sendJson(res, value, statusCode = 200) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(value));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function makeSessionCookie(sessionId) {
  const secure = cookieSecure ? "; Secure" : "";
  return `${sessionCookie}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
    sessionTtlMs / 1000
  )}${secure}`;
}

function clearSessionCookie() {
  return `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function contentDisposition(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function folderTitle(folder) {
  return folder
    .replace(/[-_]+/g, " ")
    .replace(/\b(sql)\b/gi, "SQL")
    .replace(/\b(postgresql)\b/gi, "PostgreSQL")
    .replace(/\b(bytebytego|bytebyego)\b/gi, "ByteByteGo")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[exponent]}`;
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
