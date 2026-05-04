const storageKey = "learning-platform-progress-v2";
const layoutKey = "learning-platform-layout-v1";
const state = {
  library: null,
  activeItem: null,
  lessons: [],
  currentId: null,
  progress: loadProgress(),
  wideVideo: localStorage.getItem(layoutKey) === "wide-video",
  transcript: [],
  activeCueIndex: -1,
  saveTimer: null,
  lastSavedAt: 0,
};

const els = {
  courseMenu: document.querySelector("#courseMenu"),
  tutorialMenu: document.querySelector("#tutorialMenu"),
  courseLibraryList: document.querySelector("#courseLibraryList"),
  tutorialLibraryList: document.querySelector("#tutorialLibraryList"),
  activeType: document.querySelector("#activeType"),
  activeTitle: document.querySelector("#activeTitle"),
  allResources: document.querySelector("#allResources"),
  courseMain: document.querySelector("#courseMain"),
  tutorialMain: document.querySelector("#tutorialMain"),
  tutorialMeta: document.querySelector("#tutorialMeta"),
  tutorialTitle: document.querySelector("#tutorialTitle"),
  tutorialContent: document.querySelector("#tutorialContent"),
  tutorialPrev: document.querySelector("#tutorialPrev"),
  tutorialNext: document.querySelector("#tutorialNext"),
  tutorialComplete: document.querySelector("#tutorialComplete"),
  sectionList: document.querySelector("#sectionList"),
  courseSearch: document.querySelector("#courseSearch"),
  overallPercent: document.querySelector("#overallPercent"),
  overallCount: document.querySelector("#overallCount"),
  overallBar: document.querySelector("#overallBar"),
  viewer: document.querySelector("#viewer"),
  lessonMeta: document.querySelector("#lessonMeta"),
  lessonTitle: document.querySelector("#lessonTitle"),
  prevLesson: document.querySelector("#prevLesson"),
  wideMode: document.querySelector("#wideMode"),
  nextLesson: document.querySelector("#nextLesson"),
  markComplete: document.querySelector("#markComplete"),
  resourceStrip: document.querySelector("#resourceStrip"),
  supportTitle: document.querySelector("#supportTitle"),
  transcriptList: document.querySelector("#transcriptList"),
  transcriptSearch: document.querySelector("#transcriptSearch"),
  lessonNotes: document.querySelector("#lessonNotes"),
  noteStatus: document.querySelector("#noteStatus"),
  logoutButton: document.querySelector("#logoutButton"),
};

init();

async function init() {
  try {
    state.library = await fetchJson("/api/library");
    bindEvents();
    renderLibrary();
    const rememberedItem =
      state.library.items.find((item) => item.id === state.progress.lastItemId) || state.library.items[0];
    selectItem(rememberedItem?.id);
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/login";
      return;
    }
    console.error(error);
    els.viewer.className = "viewer error";
    els.viewer.textContent = "The library could not be loaded.";
  }
}

function bindEvents() {
  els.courseSearch.addEventListener("input", renderSidebar);
  els.transcriptSearch.addEventListener("input", renderTranscript);
  els.prevLesson.addEventListener("click", () => moveLesson(-1));
  els.nextLesson.addEventListener("click", () => moveLesson(1));
  els.wideMode.addEventListener("click", () => setWideVideo(!state.wideVideo));
  els.tutorialPrev.addEventListener("click", () => moveLesson(-1));
  els.tutorialNext.addEventListener("click", () => moveLesson(1));
  els.tutorialComplete.addEventListener("click", () => {
    const lesson = currentLesson();
    if (!lesson) return;
    setComplete(lesson.id, !state.progress.completed[lesson.id]);
  });
  els.markComplete.addEventListener("click", () => {
    const lesson = currentLesson();
    if (!lesson) return;
    setComplete(lesson.id, !state.progress.completed[lesson.id]);
  });
  els.lessonNotes.addEventListener("input", () => {
    const lesson = currentLesson();
    if (!lesson) return;
    state.progress.notes[lesson.id] = els.lessonNotes.value;
    els.noteStatus.textContent = "Saving...";
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      saveProgress();
      els.noteStatus.textContent = "Saved locally";
    }, 300);
  });
  els.logoutButton.addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });
  for (const menu of [els.courseMenu, els.tutorialMenu]) {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      for (const otherMenu of [els.courseMenu, els.tutorialMenu]) {
        if (otherMenu !== menu) otherMenu.open = false;
      }
    });
  }
  document.addEventListener("click", (event) => {
    if (![els.courseMenu, els.tutorialMenu].some((menu) => menu.contains(event.target))) closeCategoryMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCategoryMenus();
  });
}

function selectItem(itemId, preferredLessonId = null) {
  const item = state.library.items.find((candidate) => candidate.id === itemId);
  if (!item) return;

  state.activeItem = item;
  state.progress.lastItemId = item.id;
  state.lessons = item.sections.flatMap((section) =>
    section.lectures.map((lesson) => ({ ...lesson, section, item }))
  );

  const rememberedId = preferredLessonId || state.progress.lastLessonByItem[item.id];
  const remembered = state.lessons.find((lesson) => lesson.id === rememberedId);
  const firstLesson = state.lessons[0];

  renderLibrary();
  renderItemHeader();
  renderProgress();
  renderSidebar();
  selectLesson((remembered || firstLesson)?.id);
}

function selectLesson(lessonId) {
  if (!lessonId) return;
  const lesson = state.lessons.find((candidate) => candidate.id === lessonId);
  if (!lesson) return;

  state.currentId = lesson.id;
  state.progress.lastLessonId = lesson.id;
  state.progress.lastLessonByItem[lesson.item.id] = lesson.id;
  saveProgress();

  renderLesson(lesson);
  renderSidebar();
  renderProgress();
}

function renderLibrary() {
  els.courseLibraryList.innerHTML = "";
  els.tutorialLibraryList.innerHTML = "";
  let courseCount = 0;
  let tutorialCount = 0;

  for (const item of state.library.items) {
    const button = document.createElement("button");
    const isActive = state.activeItem?.id === item.id;
    button.type = "button";
    button.className = ["library-option", isActive ? "is-active" : ""].filter(Boolean).join(" ");
    button.innerHTML = `
      <strong>${escapeHtml(item.title)}</strong>
      <small>${item.counts.lessons} lessons${item.counts.videos ? ` / ${item.counts.videos} videos` : ""}</small>
    `;
    button.addEventListener("click", () => {
      selectItem(item.id);
      closeCategoryMenus();
    });

    if (item.type === "tutorial") {
      tutorialCount += 1;
      els.tutorialLibraryList.append(button);
    } else {
      courseCount += 1;
      els.courseLibraryList.append(button);
    }
  }

  els.courseMenu.hidden = courseCount === 0;
  els.tutorialMenu.hidden = tutorialCount === 0;
  els.courseMenu.classList.toggle("is-active", state.activeItem?.type !== "tutorial");
  els.tutorialMenu.classList.toggle("is-active", state.activeItem?.type === "tutorial");
}

function closeCategoryMenus() {
  els.courseMenu.open = false;
  els.tutorialMenu.open = false;
}

function renderItemHeader() {
  const item = state.activeItem;
  document.body.classList.toggle("tutorial-mode", item.type === "tutorial");
  document.body.classList.toggle("course-mode", item.type !== "tutorial");
  els.courseMain.hidden = item.type === "tutorial";
  els.tutorialMain.hidden = item.type !== "tutorial";
  applyWideVideo();
  els.activeType.textContent = item.type === "tutorial" ? "Text tutorial" : "Video course";
  els.activeTitle.textContent = item.title;
  els.allResources.hidden = !item.allResourcesUrl;
  if (item.allResourcesUrl) els.allResources.href = item.allResourcesUrl;
  els.courseSearch.value = "";
}

function setWideVideo(enabled) {
  state.wideVideo = enabled;
  localStorage.setItem(layoutKey, enabled ? "wide-video" : "standard");
  applyWideVideo();
}

function applyWideVideo() {
  const activeForCourse = state.wideVideo && state.activeItem?.type !== "tutorial";
  document.body.classList.toggle("wide-video-mode", activeForCourse);
  els.wideMode.textContent = activeForCourse ? "Standard view" : "Wide view";
  els.wideMode.setAttribute("aria-pressed", String(activeForCourse));
  els.wideMode.title = activeForCourse ? "Restore the sidebar layout" : "Hide the sidebar and widen the video";
}

function renderProgress() {
  const completed = state.lessons.filter((lesson) => state.progress.completed[lesson.id]).length;
  const total = state.lessons.length || 1;
  const percent = Math.round((completed / total) * 100);
  els.overallPercent.textContent = `${percent}%`;
  els.overallCount.textContent = `${completed} of ${state.lessons.length} lessons complete`;
  els.overallBar.style.width = `${percent}%`;
}

function renderSidebar() {
  const query = els.courseSearch.value.trim().toLowerCase();
  els.sectionList.innerHTML = "";

  for (const section of state.activeItem.sections) {
    const matchingLessons = section.lectures.filter((lesson) => lessonMatches(lesson, section, query));
    const sectionMatches = !query || section.title.toLowerCase().includes(query);
    if (query && !matchingLessons.length && !sectionMatches) continue;

    const sectionNode = document.createElement("section");
    sectionNode.className = "section-block";

    const completed = section.lectures.filter((lesson) => state.progress.completed[lesson.id]).length;
    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `
      <div>
        <span class="section-number">${String(section.index).padStart(2, "0")}</span>
        <h2>${escapeHtml(section.title)}</h2>
      </div>
      <span class="section-progress">${completed}/${section.lectures.length}</span>
    `;
    sectionNode.append(header);

    if (section.resourceCount > 0 && section.downloadUrl) {
      const resourceRow = document.createElement("div");
      resourceRow.className = "section-resource-row";
      resourceRow.innerHTML = `
        <span>${section.resourceCount} resource${section.resourceCount === 1 ? "" : "s"}</span>
        <a href="${section.downloadUrl}">Download resources</a>
      `;
      sectionNode.append(resourceRow);
    }

    const list = document.createElement("div");
    list.className = "lesson-list";
    const lessonsToRender = query && !sectionMatches ? matchingLessons : section.lectures;
    for (const lesson of lessonsToRender) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "lesson-item",
        lesson.id === state.currentId ? "is-active" : "",
        state.progress.completed[lesson.id] ? "is-complete" : "",
      ]
        .filter(Boolean)
        .join(" ");
      button.innerHTML = `
        <span class="lesson-status" aria-hidden="true"></span>
        <span class="lesson-copy">
          <span class="lesson-name">${String(lesson.number).padStart(3, "0")} ${escapeHtml(lesson.title)}</span>
          <span class="lesson-kind">${lesson.type}${lesson.resourceCount ? ` / ${lesson.resourceCount} resources` : ""}</span>
        </span>
      `;
      button.addEventListener("click", () => selectLesson(lesson.id));
      list.append(button);
    }
    sectionNode.append(list);
    els.sectionList.append(sectionNode);
  }
}

function renderLesson(lesson) {
  if (lesson.item.type === "tutorial") {
    renderTutorialLesson(lesson);
    return;
  }

  renderCourseLesson(lesson);
}

function renderCourseLesson(lesson) {
  const index = state.lessons.findIndex((candidate) => candidate.id === lesson.id);
  const sectionLabel = state.activeItem.type === "tutorial" ? "Chapter" : "Section";
  els.lessonMeta.textContent = `${sectionLabel} ${String(lesson.section.index).padStart(2, "0")} / ${lesson.type}`;
  els.lessonTitle.textContent = lesson.title;
  els.prevLesson.disabled = index <= 0;
  els.nextLesson.disabled = index >= state.lessons.length - 1;
  updateMarkButton();
  renderResources(lesson);
  renderViewer(lesson);
  renderNotes(lesson);
  loadTranscript(lesson);
}

async function renderTutorialLesson(lesson) {
  const index = state.lessons.findIndex((candidate) => candidate.id === lesson.id);
  els.tutorialMeta.textContent = `${lesson.item.title} / chapter ${String(lesson.number).padStart(2, "0")}`;
  els.tutorialTitle.textContent = lesson.title;
  els.tutorialPrev.disabled = index <= 0;
  els.tutorialNext.disabled = index >= state.lessons.length - 1;
  updateMarkButton();

  els.tutorialContent.innerHTML = `<p class="empty-state">Loading article...</p>`;
  try {
    const response = await fetch(lesson.article.articleUrl || lesson.article.mediaUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const articleMain = doc.querySelector("main") || doc.body;
    const firstHeading = articleMain?.querySelector("h1");
    if (firstHeading && firstHeading.textContent.trim() === lesson.title.trim()) {
      firstHeading.remove();
    }
    els.tutorialContent.innerHTML = articleMain?.innerHTML || html;
    els.tutorialMain.scrollTo({ top: 0, behavior: "auto" });
    state.progress.positions[lesson.id] = 1;
    saveProgress();
  } catch (error) {
    console.error(error);
    els.tutorialContent.innerHTML = `<p class="empty-state">This article could not be loaded.</p>`;
  }
}

function renderViewer(lesson) {
  state.activeCueIndex = -1;
  els.viewer.innerHTML = "";
  els.viewer.className = "viewer";

  if (lesson.video) {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = lesson.video.mediaUrl;

    if (lesson.caption) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = "English";
      track.srclang = "en";
      track.src = captionUrl(lesson.caption.path);
      track.default = true;
      video.append(track);
    }

    video.addEventListener("loadedmetadata", () => {
      const savedTime = state.progress.positions[lesson.id] || 0;
      if (savedTime > 3 && savedTime < video.duration - 8) video.currentTime = savedTime;
      if (Number.isFinite(video.duration)) {
        state.progress.durations[lesson.id] = video.duration;
        saveProgress();
      }
    });

    video.addEventListener("timeupdate", () => {
      if (!Number.isFinite(video.currentTime)) return;
      state.progress.positions[lesson.id] = video.currentTime;
      if (Number.isFinite(video.duration)) {
        state.progress.durations[lesson.id] = video.duration;
        if (video.duration > 0 && video.currentTime / video.duration >= 0.95) {
          setComplete(lesson.id, true, { quiet: true });
        }
      }
      throttledSave();
      updateActiveCue(video.currentTime);
    });

    video.addEventListener("ended", () => setComplete(lesson.id, true));
    els.viewer.append(video);
    return;
  }

  if (lesson.article) {
    els.viewer.classList.add("document-viewer");
    const iframe = document.createElement("iframe");
    iframe.className = "article-frame";
    iframe.src = lesson.article.articleUrl || lesson.article.mediaUrl;
    iframe.title = lesson.title;
    iframe.sandbox = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";
    iframe.addEventListener("load", () => {
      state.progress.positions[lesson.id] = 1;
      saveProgress();
    });
    els.viewer.append(iframe);
    return;
  }

  const resourcePanel = document.createElement("div");
  resourcePanel.className = "resource-viewer";
  resourcePanel.innerHTML = `<h3>${escapeHtml(lesson.title)}</h3><div class="resource-list-inline"></div>`;
  renderResourceLinks([lesson.resources[0]].filter(Boolean), resourcePanel.querySelector(".resource-list-inline"));
  els.viewer.append(resourcePanel);
}

function renderResources(lesson) {
  const resources = lesson.resources || [];
  els.resourceStrip.innerHTML = "";
  els.resourceStrip.hidden = resources.length === 0;
  if (!resources.length) return;

  const title = document.createElement("strong");
  title.textContent = "Attached resources";
  els.resourceStrip.append(title);
  renderResourceLinks(resources, els.resourceStrip);
}

function renderResourceLinks(resources, container) {
  for (const resource of resources) {
    const item = document.createElement("span");
    item.className = "resource-chip";
    item.innerHTML = `<span>${escapeHtml(resource.name)}</span>`;

    if (isOpenable(resource.ext)) {
      const open = document.createElement("a");
      open.href = resource.mediaUrl;
      open.target = "_blank";
      open.rel = "noreferrer";
      open.textContent = "Open";
      item.append(open);
    }

    const download = document.createElement("a");
    download.href = resource.downloadUrl;
    download.textContent = "Download";
    item.append(download);
    container.append(item);
  }
}

async function loadTranscript(lesson) {
  state.transcript = [];
  els.transcriptSearch.value = "";
  els.supportTitle.textContent = lesson.video ? "Transcript" : "Reading";
  els.transcriptSearch.hidden = !lesson.video;

  if (!lesson.video) {
    els.transcriptList.innerHTML = `<p class="empty-state">Use the course index on the left to move between documents.</p>`;
    return;
  }

  if (!lesson.caption) {
    els.transcriptList.innerHTML = `<p class="empty-state">No subtitles were found for this lesson.</p>`;
    return;
  }

  els.transcriptList.innerHTML = `<p class="empty-state">Loading transcript...</p>`;
  try {
    state.transcript = await fetchJson(transcriptUrl(lesson.caption.path));
    renderTranscript();
  } catch (error) {
    console.error(error);
    els.transcriptList.innerHTML = `<p class="empty-state">The transcript could not be loaded.</p>`;
  }
}

function renderTranscript() {
  const query = els.transcriptSearch.value.trim().toLowerCase();
  const cues = query
    ? state.transcript.filter((cue) => cue.text.toLowerCase().includes(query))
    : state.transcript;

  if (!cues.length) {
    els.transcriptList.innerHTML = `<p class="empty-state">No transcript matches.</p>`;
    return;
  }

  els.transcriptList.innerHTML = "";
  for (const cue of cues) {
    const originalIndex = state.transcript.indexOf(cue);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cue";
    button.dataset.cueIndex = String(originalIndex);
    button.innerHTML = `<span>${formatTime(cue.start)}</span><p>${escapeHtml(cue.text)}</p>`;
    button.addEventListener("click", () => seekTo(cue.start));
    els.transcriptList.append(button);
  }
}

function renderNotes(lesson) {
  els.lessonNotes.value = state.progress.notes[lesson.id] || "";
  els.noteStatus.textContent = "Saved locally";
}

function updateActiveCue(time) {
  if (!state.transcript.length) return;
  const nextIndex = state.transcript.findIndex((cue) => time >= cue.start && time <= cue.end);
  if (nextIndex === state.activeCueIndex) return;

  const previous = els.transcriptList.querySelector(".cue.is-active");
  if (previous) previous.classList.remove("is-active");

  state.activeCueIndex = nextIndex;
  if (nextIndex >= 0) {
    const next = els.transcriptList.querySelector(`[data-cue-index="${nextIndex}"]`);
    if (next) next.classList.add("is-active");
  }
}

function seekTo(seconds) {
  const video = els.viewer.querySelector("video");
  if (!video) return;
  video.currentTime = seconds;
  video.play().catch(() => {});
}

function moveLesson(direction) {
  const index = state.lessons.findIndex((lesson) => lesson.id === state.currentId);
  const next = state.lessons[index + direction];
  if (next) selectLesson(next.id);
}

function setComplete(lessonId, complete, options = {}) {
  if (complete) state.progress.completed[lessonId] = true;
  else delete state.progress.completed[lessonId];
  saveProgress();
  renderProgress();
  renderSidebar();
  updateMarkButton();
  if (!options.quiet) {
    els.noteStatus.textContent = complete ? "Lesson complete" : "Lesson reopened";
    window.setTimeout(() => {
      els.noteStatus.textContent = "Saved locally";
    }, 900);
  }
}

function updateMarkButton() {
  const lesson = currentLesson();
  const complete = lesson ? state.progress.completed[lesson.id] : false;
  els.markComplete.textContent = complete ? "Completed" : "Mark complete";
  els.markComplete.classList.toggle("is-complete", Boolean(complete));
  els.tutorialComplete.textContent = complete ? "Completed" : "Mark complete";
  els.tutorialComplete.classList.toggle("is-complete", Boolean(complete));
}

function lessonMatches(lesson, section, query) {
  if (!query) return true;
  return `${section.title} ${lesson.title} ${lesson.type}`.toLowerCase().includes(query);
}

function currentLesson() {
  return state.lessons.find((lesson) => lesson.id === state.currentId);
}

function throttledSave() {
  const now = Date.now();
  if (now - state.lastSavedAt < 1200) return;
  state.lastSavedAt = now;
  saveProgress();
}

function loadProgress() {
  try {
    return {
      completed: {},
      positions: {},
      durations: {},
      notes: {},
      lastItemId: null,
      lastLessonId: null,
      lastLessonByItem: {},
      ...JSON.parse(localStorage.getItem(storageKey) || "{}"),
    };
  } catch {
    return {
      completed: {},
      positions: {},
      durations: {},
      notes: {},
      lastItemId: null,
      lastLessonId: null,
      lastLessonByItem: {},
    };
  }
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(state.progress));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function captionUrl(relativePath) {
  return `/caption/${encodePath(relativePath)}`;
}

function transcriptUrl(relativePath) {
  return `/api/transcript/${encodePath(relativePath)}`;
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function isOpenable(ext) {
  return [".html", ".htm", ".pdf", ".txt", ".sql", ".csv", ".json", ".md", ".markdown"].includes(ext);
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
