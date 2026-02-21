const RECENT_DOCS_KEY = "recent_docs_v1";
const MAX_RECENTS = 20;
const HANDLE_DB_NAME = "md_viewer_handles_v1";
const HANDLE_STORE = "handles";
const DEFAULT_SECTION_HEIGHT = 280;
const OVERSCAN_PX = 800;

const openFileButton = document.getElementById("open-file-btn");
const refreshButton = document.getElementById("refresh-btn");
const statusLine = document.getElementById("status-line");
const contentRoot = document.getElementById("content-root");
const recentList = document.getElementById("recent-list");
const tocList = document.getElementById("toc-list");
const markdownRenderer =
  typeof window.markdownit === "function"
    ? window.markdownit({
        html: false,
        linkify: true,
        typographer: true,
        breaks: false
      })
    : null;
const parserWorker = new Worker("worker/markdown_worker.js", { type: "classic" });
let currentDocState = null;
let currentRawText = "";
let virtualTopSpacer = null;
let virtualWindow = null;
let virtualBottomSpacer = null;
let virtualRenderScheduled = false;
let pendingTocSectionId = null;

function isMarkdownPath(path) {
  const value = (path || "").toLowerCase();
  return value.endsWith(".md") || value.endsWith(".markdown");
}

function getNameFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const segments = (url.pathname || "").split("/").filter(Boolean);
    if (!segments.length) {
      return "document.md";
    }
    return decodeURIComponent(segments[segments.length - 1]);
  } catch (_error) {
    return "document.md";
  }
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE, { keyPath: "docId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(docId, handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put({ docId, handle, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getHandle(docId) {
  const db = await openHandleDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const req = tx.objectStore(HANDLE_STORE).get(docId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row?.handle || null;
}

async function computeDocIdFromValues(name, size, lastModified, filePathHint = "") {
  const payload = `${name}|${size}|${lastModified}|${filePathHint}`;
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function computeDocId(file, filePathHint = "") {
  return computeDocIdFromValues(file.name, file.size, file.lastModified, filePathHint);
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

function storageSet(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve());
  });
}

async function upsertRecentDoc(entry) {
  const previous = (await storageGet(RECENT_DOCS_KEY)) || [];
  const withoutDup = previous.filter((item) => item.docId !== entry.docId);
  const next = [{ ...entry, lastOpenedAt: Date.now() }, ...withoutDup].slice(0, MAX_RECENTS);
  await storageSet({ [RECENT_DOCS_KEY]: next });
  return next;
}

function renderRecentDocs(docs) {
  recentList.innerHTML = "";
  if (!docs.length) {
    recentList.innerHTML = "<li>No recent documents</li>";
    return;
  }

  docs.forEach((doc) => {
    const listItem = document.createElement("li");
    const button = document.createElement("button");
    const openedAt = new Date(doc.lastOpenedAt).toLocaleString();
    button.type = "button";
    button.textContent = `${doc.name} (${openedAt})`;
    button.addEventListener("click", () => {
      void reopenRecentDoc(doc);
    });
    listItem.appendChild(button);
    recentList.appendChild(listItem);
  });
}

async function loadAndRenderRecents() {
  const docs = (await storageGet(RECENT_DOCS_KEY)) || [];
  renderRecentDocs(docs);
}

function renderMarkdown(text) {
  if (!markdownRenderer) {
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  const html = markdownRenderer.render(text);
  if (!window.DOMPurify) {
    return html;
  }

  return window.DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick"]
  });
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateStatus(message) {
  statusLine.textContent = message;
}

function resetRenderState(docId, file, sourceUrl = "") {
  currentDocState = {
    docId,
    fileName: file.name,
    fileSize: file.size,
    sourceUrl,
    sections: [],
    sectionHeights: [],
    sectionOffsets: [0],
    sectionIndexById: new Map(),
    visibleStart: -1,
    visibleEnd: -1
  };
  setupVirtualizedRoot();
  tocList.innerHTML = "<li>Parsing...</li>";
}

function appendSections(docId, sections) {
  if (!currentDocState || currentDocState.docId !== docId) {
    return;
  }

  sections.forEach((section) => {
    section.renderedHtml = "";
    currentDocState.sectionIndexById.set(section.sectionId, currentDocState.sections.length);
    currentDocState.sections.push(section);
    currentDocState.sectionHeights.push(estimateSectionHeight(section));
  });
  rebuildSectionOffsets();
  scheduleVirtualRender();
}

function renderToc(meta) {
  const toc = meta?.toc || [];
  tocList.innerHTML = "";
  if (!toc.length) {
    tocList.innerHTML = "<li>No headings found</li>";
    return;
  }

  toc.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.style.marginLeft = `${Math.max((item.headerLevel || 1) - 1, 0) * 10}px`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.headerText;
    button.addEventListener("click", () => {
      scrollToSection(item.sectionId);
    });
    listItem.appendChild(button);
    tocList.appendChild(listItem);
  });
}

function setupVirtualizedRoot() {
  contentRoot.innerHTML = "";
  virtualTopSpacer = document.createElement("div");
  virtualTopSpacer.className = "virtual-spacer virtual-spacer-top";
  virtualTopSpacer.setAttribute("aria-hidden", "true");
  virtualWindow = document.createElement("div");
  virtualWindow.className = "virtual-window";
  virtualBottomSpacer = document.createElement("div");
  virtualBottomSpacer.className = "virtual-spacer virtual-spacer-bottom";
  virtualBottomSpacer.setAttribute("aria-hidden", "true");
  contentRoot.appendChild(virtualTopSpacer);
  contentRoot.appendChild(virtualWindow);
  contentRoot.appendChild(virtualBottomSpacer);
}

function estimateSectionHeight(section) {
  const lineCount = (section.markdown?.match(/\n/g)?.length || 0) + 1;
  return Math.min(Math.max(lineCount * 22, 120), 900);
}

function rebuildSectionOffsets() {
  if (!currentDocState) {
    return;
  }

  const offsets = [0];
  for (let i = 0; i < currentDocState.sectionHeights.length; i += 1) {
    offsets.push(offsets[i] + currentDocState.sectionHeights[i]);
  }
  currentDocState.sectionOffsets = offsets;
}

function lowerBound(sortedArray, target) {
  let lo = 0;
  let hi = sortedArray.length;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (sortedArray[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function getVisibleRange() {
  if (!currentDocState || !currentDocState.sections.length) {
    return { start: 0, end: -1 };
  }

  const offsets = currentDocState.sectionOffsets;
  const sectionCount = currentDocState.sections.length;
  const rootTop = contentRoot.getBoundingClientRect().top + window.scrollY;
  const viewportTop = window.scrollY - rootTop;
  const viewportBottom = viewportTop + window.innerHeight;
  const from = Math.max(0, viewportTop - OVERSCAN_PX);
  const to = Math.max(from, viewportBottom + OVERSCAN_PX);
  const startIndex = Math.max(Math.min(lowerBound(offsets, from) - 1, sectionCount - 1), 0);
  const endIndex = Math.max(Math.min(lowerBound(offsets, to) - 1, sectionCount - 1), startIndex);
  return { start: startIndex, end: endIndex };
}

function getSectionHtml(section) {
  if (!section.renderedHtml) {
    section.renderedHtml = renderMarkdown(section.markdown || section.plainTextPreview || "");
  }
  return section.renderedHtml;
}

function applySpacerState(spacer, heightPx, skippedCount, position) {
  spacer.style.height = `${Math.max(0, Math.floor(heightPx))}px`;
  spacer.textContent = skippedCount > 0 ? `... ${skippedCount} sections ${position} ...` : "";
  spacer.classList.toggle("active", skippedCount > 0);
}

function renderVirtualSections() {
  if (!currentDocState || !virtualWindow) {
    return;
  }

  const totalSections = currentDocState.sections.length;
  if (!totalSections) {
    applySpacerState(virtualTopSpacer, 0, 0, "above");
    applySpacerState(virtualBottomSpacer, 0, 0, "below");
    virtualWindow.innerHTML = "";
    currentDocState.visibleStart = -1;
    currentDocState.visibleEnd = -1;
    return;
  }

  const { start, end } = getVisibleRange();
  const rangeChanged = start !== currentDocState.visibleStart || end !== currentDocState.visibleEnd;
  if (rangeChanged) {
    currentDocState.visibleStart = start;
    currentDocState.visibleEnd = end;
    const fragment = document.createDocumentFragment();
    for (let i = start; i <= end; i += 1) {
      const section = currentDocState.sections[i];
      const container = document.createElement("section");
      container.className = "md-section";
      container.id = section.sectionId;
      container.dataset.sectionIndex = String(i);
      container.innerHTML = getSectionHtml(section);
      fragment.appendChild(container);
    }

    virtualWindow.innerHTML = "";
    virtualWindow.appendChild(fragment);
  }

  const offsets = currentDocState.sectionOffsets;
  const topHeight = offsets[start];
  const bottomHeight = offsets[totalSections] - offsets[end + 1];
  applySpacerState(virtualTopSpacer, topHeight, start, "above");
  applySpacerState(virtualBottomSpacer, bottomHeight, totalSections - end - 1, "below");
  if (rangeChanged) {
    syncMeasuredHeights();
  } else if (pendingTocSectionId) {
    const target = document.getElementById(pendingTocSectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingTocSectionId = null;
    }
  }
}

function syncMeasuredHeights() {
  if (!currentDocState || !virtualWindow?.children.length) {
    return;
  }

  let changed = false;
  const nodes = virtualWindow.querySelectorAll("[data-section-index]");
  nodes.forEach((node) => {
    const idx = Number(node.dataset.sectionIndex);
    if (!Number.isInteger(idx)) {
      return;
    }
    const measured = Math.max(node.offsetHeight, 80);
    if (Math.abs((currentDocState.sectionHeights[idx] || DEFAULT_SECTION_HEIGHT) - measured) > 4) {
      currentDocState.sectionHeights[idx] = measured;
      changed = true;
    }
  });

  if (changed) {
    rebuildSectionOffsets();
    scheduleVirtualRender();
  }

  if (pendingTocSectionId) {
    const target = document.getElementById(pendingTocSectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingTocSectionId = null;
    }
  }
}

function scheduleVirtualRender() {
  if (virtualRenderScheduled) {
    return;
  }
  virtualRenderScheduled = true;
  requestAnimationFrame(() => {
    virtualRenderScheduled = false;
    renderVirtualSections();
  });
}

function scrollToSection(sectionId) {
  if (!currentDocState) {
    return;
  }

  const idx = currentDocState.sectionIndexById.get(sectionId);
  if (idx === undefined) {
    return;
  }

  pendingTocSectionId = sectionId;
  const rootTop = contentRoot.getBoundingClientRect().top + window.scrollY;
  const topOffset = currentDocState.sectionOffsets[idx] || 0;
  window.scrollTo({
    top: Math.max(rootTop + topOffset - 12, 0),
    behavior: "smooth"
  });
  scheduleVirtualRender();
}

async function parseAndRenderText({ text, docId, fileName, fileSize, sourceUrl = "" }) {
  currentRawText = text;
  resetRenderState(
    docId,
    {
      name: fileName,
      size: fileSize
    },
    sourceUrl
  );
  updateStatus(`Parsing: ${fileName} (${fileSize.toLocaleString()} bytes) / docId: ${docId}`);
  parserWorker.postMessage({
    type: "PARSE_REQUEST",
    docId,
    text,
    splitStrategy: "h1_h3_then_line_chunk"
  });
}

async function parseAndRenderDocument(file, docId, sourceUrl = "") {
  const text = await file.text();
  await parseAndRenderText({
    text,
    docId,
    fileName: file.name,
    fileSize: file.size,
    sourceUrl
  });
}

async function openFromSourceUrl(sourceUrl) {
  try {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "file:" || !isMarkdownPath(parsedUrl.pathname)) {
      updateStatus("Source URL is not a markdown file.");
      return false;
    }
  } catch (_error) {
    updateStatus("Invalid source URL.");
    return false;
  }

  try {
    updateStatus("Loading markdown from file URL...");
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const fileName = getNameFromUrl(sourceUrl);
    const fileSize = new TextEncoder().encode(text).length;
    const docId = await computeDocIdFromValues(fileName, fileSize, 0, sourceUrl);

    await parseAndRenderText({
      text,
      docId,
      fileName,
      fileSize,
      sourceUrl
    });

    const docs = await upsertRecentDoc({
      docId,
      name: fileName,
      size: fileSize,
      lastModified: 0,
      sourceUrl
    });
    renderRecentDocs(docs);
    return true;
  } catch (error) {
    console.error(error);
    updateStatus("Failed to load file URL directly. Click Open File to reselect the same file.");
    return false;
  }
}

function getSourceUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("src");
  if (!source) {
    return "";
  }

  try {
    const parsed = new URL(source);
    if (parsed.protocol !== "file:" || !isMarkdownPath(parsed.pathname)) {
      return "";
    }
    return parsed.href;
  } catch (_error) {
    return "";
  }
}

async function openMarkdownFile() {
  if (!window.showOpenFilePicker) {
    statusLine.textContent = "File System Access API is not available in this context.";
    return;
  }

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "Markdown files",
          accept: {
            "text/markdown": [".md", ".markdown"]
          }
        }
      ]
    });

    const file = await fileHandle.getFile();
    const docId = await computeDocId(file);

    await saveHandle(docId, fileHandle);
    await parseAndRenderDocument(file, docId);

    const docs = await upsertRecentDoc({
      docId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      sourceUrl: ""
    });
    renderRecentDocs(docs);
  } catch (error) {
    if (error?.name === "AbortError") {
      statusLine.textContent = "File selection canceled.";
      return;
    }

    console.error(error);
    statusLine.textContent = "Failed to open file.";
  }
}

async function reopenRecentDoc(doc) {
  if (doc?.sourceUrl) {
    const loaded = await openFromSourceUrl(doc.sourceUrl);
    if (loaded) {
      return;
    }
  }

  try {
    const handle = await getHandle(doc.docId);
    if (!handle) {
      statusLine.textContent = "Handle not found. Please reselect the file.";
      await openMarkdownFile();
      return;
    }

    if (handle.queryPermission) {
      const state = await handle.queryPermission({ mode: "read" });
      if (state !== "granted") {
        const requested = await handle.requestPermission({ mode: "read" });
        if (requested !== "granted") {
          statusLine.textContent = "Permission denied. Please reselect the file.";
          return;
        }
      }
    }

    const file = await handle.getFile();
    await parseAndRenderDocument(file, doc.docId);
    const docs = await upsertRecentDoc({
      docId: doc.docId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      sourceUrl: doc.sourceUrl || ""
    });
    renderRecentDocs(docs);
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Failed to reopen recent document.";
  }
}

openFileButton.addEventListener("click", () => void openMarkdownFile());
refreshButton.addEventListener("click", () => {
  if (!currentDocState) {
    updateStatus("No document loaded.");
    return;
  }
  void reopenRecentDoc({ docId: currentDocState.docId });
});

parserWorker.addEventListener("message", (event) => {
  const { type, docId, sections, meta, error } = event.data || {};
  if (!currentDocState || currentDocState.docId !== docId) {
    return;
  }

  if (type === "PARSE_PROGRESS") {
    appendSections(docId, sections || []);
    updateStatus(
      `Rendering ${currentDocState.fileName}: ${currentDocState.sections.length} sections loaded`
    );
    return;
  }

  if (type === "PARSE_DONE") {
    renderToc(meta);
    updateStatus(
      `Loaded: ${currentDocState.fileName} (${currentDocState.fileSize.toLocaleString()} bytes) / ${currentDocState.sections.length} sections`
    );
    return;
  }

  if (type === "PARSE_ERROR") {
    console.error(error);
    contentRoot.innerHTML = `<pre>${escapeHtml(currentRawText)}</pre>`;
    updateStatus("Parser error. See console.");
  }
});

window.addEventListener("scroll", scheduleVirtualRender, { passive: true });
window.addEventListener("resize", scheduleVirtualRender);

async function initializeViewer() {
  await loadAndRenderRecents();
  const sourceUrl = getSourceUrlFromQuery();
  if (sourceUrl) {
    await openFromSourceUrl(sourceUrl);
  }
}

void initializeViewer();
