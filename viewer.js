import { getDocumentCache, saveDocumentCache, setCacheMeta, touchDocument } from "./storage/db.js";
import {
  listPresets,
  getPresetOrDefault,
  getDocPreset,
  setDocPreset,
  clearDocPreset,
  ensureDefaultPreset,
  DEFAULT_PRESET_ID
} from "./storage/presets.js";

const RECENT_DOCS_KEY = "recent_docs_v1";
const MAX_RECENTS = 20;
const HANDLE_DB_NAME = "md_viewer_handles_v1";
const HANDLE_STORE = "handles";
const openFileButton = document.getElementById("open-file-btn");
const refreshButton = document.getElementById("refresh-btn");
const presetSelect = document.getElementById("preset-select");
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

function renderNavEmpty(ul, message) {
  ul.innerHTML = "";
  const li = document.createElement("li");
  li.className = "nav-tree-empty";
  li.textContent = message;
  ul.appendChild(li);
}

function makeDirNode(label) {
  return { label, subdirs: new Map(), files: [] };
}

function getDocPathSegments(doc) {
  if (!doc.sourceUrl) {
    return null;
  }
  try {
    const u = new URL(doc.sourceUrl);
    const parts = (u.pathname || "").split("/").filter(Boolean);
    if (!parts.length) {
      return null;
    }
    return parts.map((p) => decodeURIComponent(p.replace(/\+/g, " ")));
  } catch (_error) {
    return null;
  }
}

function addDocToRecentDirTree(root, doc) {
  const segments = getDocPathSegments(doc);
  if (!segments?.length) {
    root.files.push(doc);
    return;
  }
  let dir = root;
  if (segments.length === 1) {
    dir.files.push({ ...doc, _displayName: segments[0] });
    return;
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (!dir.subdirs.has(seg)) {
      dir.subdirs.set(seg, makeDirNode(seg));
    }
    dir = dir.subdirs.get(seg);
  }
  dir.files.push({ ...doc, _displayName: segments[segments.length - 1] });
}

function buildRecentDirTree(docs) {
  const root = makeDirNode("");
  for (const doc of docs) {
    addDocToRecentDirTree(root, doc);
  }
  return root;
}

function makeFolderBranch(defaultOpen) {
  const li = document.createElement("li");
  li.className = "nav-tree-branch";
  const folderBtn = document.createElement("button");
  folderBtn.type = "button";
  folderBtn.className = "nav-tree-folder-btn";
  folderBtn.setAttribute("aria-expanded", String(defaultOpen));
  const chev = document.createElement("span");
  chev.className = "nav-tree-chevron";
  chev.setAttribute("aria-hidden", "true");
  chev.textContent = defaultOpen ? "▼" : "▶";
  const text = document.createElement("span");
  text.className = "nav-tree-folder-text";
  folderBtn.appendChild(chev);
  folderBtn.appendChild(text);
  const nestedUl = document.createElement("ul");
  nestedUl.className = "nav-tree nav-tree-nested";
  nestedUl.hidden = !defaultOpen;
  folderBtn.addEventListener("click", () => {
    const willShow = nestedUl.hidden;
    nestedUl.hidden = !willShow;
    folderBtn.setAttribute("aria-expanded", String(willShow));
    chev.textContent = willShow ? "▼" : "▶";
  });
  li.appendChild(folderBtn);
  li.appendChild(nestedUl);
  return { li, nestedUl, setLabel: (label) => {
    text.textContent = label;
    folderBtn.setAttribute("aria-label", `폴더 ${label} 펼치기`);
  } };
}

function renderRecentDirNode(dir, ul, depth) {
  const subKeys = [...dir.subdirs.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  for (const key of subKeys) {
    const sub = dir.subdirs.get(key);
    const { li, nestedUl, setLabel } = makeFolderBranch(depth < 2);
    setLabel(sub.label);
    renderRecentDirNode(sub, nestedUl, depth + 1);
    ul.appendChild(li);
  }
  for (const doc of dir.files) {
    const li = document.createElement("li");
    li.className = "nav-tree-leaf";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-tree-link";
    const name = doc._displayName || doc.name;
    const openedAt = new Date(doc.lastOpenedAt).toLocaleString();
    button.textContent = name;
    button.title = `${name} · ${openedAt}`;
    button.addEventListener("click", () => {
      void reopenRecentDoc(doc);
    });
    li.appendChild(button);
    ul.appendChild(li);
  }
}

function renderRecentDocs(docs) {
  recentList.innerHTML = "";
  if (!docs.length) {
    renderNavEmpty(recentList, "No recent documents");
    return;
  }
  const tree = buildRecentDirTree(docs);
  renderRecentDirNode(tree, recentList, 0);
}

function setupSidebarTabs() {
  const tabRecent = document.getElementById("sidebar-tab-recent");
  const tabOutline = document.getElementById("sidebar-tab-outline");
  const panelRecent = document.getElementById("sidebar-panel-recent");
  const panelOutline = document.getElementById("sidebar-panel-outline");
  if (!tabRecent || !tabOutline || !panelRecent || !panelOutline) {
    return;
  }
  const activate = (which) => {
    const recent = which === "recent";
    tabRecent.setAttribute("aria-selected", String(recent));
    tabOutline.setAttribute("aria-selected", String(!recent));
    panelRecent.classList.toggle("is-hidden", !recent);
    panelOutline.classList.toggle("is-hidden", recent);
  };
  tabRecent.addEventListener("click", () => activate("recent"));
  tabOutline.addEventListener("click", () => activate("outline"));
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

/** Apply preset.styleJson to #content-root as CSS custom properties for immediate render update */
function applyPresetStyles(preset) {
  if (!preset?.styleJson || !contentRoot) {
    return;
  }
  const s = preset.styleJson;
  const root = contentRoot;

  root.style.setProperty("--preset-font-family", s.fontFamily ?? "");
  root.style.setProperty("--preset-font-size", s.fontSize ?? "");
  root.style.setProperty("--preset-line-height", s.lineHeight ?? "");
  root.style.setProperty("--preset-content-max-width", s.contentMaxWidth ?? "none");
  root.style.setProperty("--preset-code-font-family", s.codeFontFamily ?? "");

  const tags = s.tags || {};
  for (const [tag, style] of Object.entries(tags)) {
    if (!style || typeof style !== "object") continue;
    const prefix = `--preset-${tag.replace(/^h(\d)$/, "h$1")}`;
    if (style.fontSize) root.style.setProperty(`${prefix}-font-size`, style.fontSize);
    if (style.fontWeight) root.style.setProperty(`${prefix}-font-weight`, style.fontWeight);
    if (style.fontFamily) root.style.setProperty(`${prefix}-font-family`, style.fontFamily);
    if (style.marginTop !== undefined) root.style.setProperty(`${prefix}-margin-top`, style.marginTop);
    if (style.marginBottom !== undefined) root.style.setProperty(`${prefix}-margin-bottom`, style.marginBottom);
    if (tag === "pre") {
      if (style.padding) root.style.setProperty("--preset-pre-padding", style.padding);
      if (style.borderRadius) root.style.setProperty("--preset-pre-border-radius", style.borderRadius);
      if (style.border) root.style.setProperty("--preset-pre-border", style.border);
      if (style.background) root.style.setProperty("--preset-pre-background", style.background);
    }
    if (tag === "blockquote") {
      if (style.padding) root.style.setProperty("--preset-blockquote-padding", style.padding);
      if (style.borderLeft) root.style.setProperty("--preset-blockquote-border-left", style.borderLeft);
      if (style.background) root.style.setProperty("--preset-blockquote-background", style.background);
    }
    if (tag === "th" || tag === "td") {
      if (style.border) root.style.setProperty("--preset-td-border", style.border);
      if (style.padding) root.style.setProperty("--preset-td-padding", style.padding);
    }
  }
}

async function loadPresetForDoc(docId) {
  const presetId = (await getDocPreset(docId)) || DEFAULT_PRESET_ID;
  const preset = await getPresetOrDefault(presetId);
  if (preset) {
    applyPresetStyles(preset);
  }
  return preset;
}

async function refreshPresetSelect(docId) {
  const presets = await listPresets();
  presetSelect.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "— Default —";
  presetSelect.appendChild(defaultOpt);
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = p.presetId;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  }
  if (docId) {
    const mapped = await getDocPreset(docId);
    presetSelect.value = mapped || "";
  } else {
    presetSelect.value = "";
  }
  presetSelect.disabled = !docId;
}

async function onPresetChange() {
  if (!currentDocState?.docId) return;
  const value = presetSelect.value;
  if (value) {
    await setDocPreset(currentDocState.docId, value);
  } else {
    await clearDocPreset(currentDocState.docId);
  }
  const preset = await getPresetOrDefault(value || DEFAULT_PRESET_ID);
  if (preset) {
    applyPresetStyles(preset);
  }
}

function updateStatus(message) {
  statusLine.textContent = message;
}

function resetRenderState(docId, file, sourceUrl = "", sourceType = "fileHandle") {
  currentDocState = {
    docId,
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified || 0,
    sourceType,
    sourceUrl,
    toc: [],
    sections: [],
    sectionIndexById: new Map()
  };
  contentRoot.innerHTML = "";
  renderNavEmpty(tocList, "Parsing…");
}

function appendSections(docId, sections) {
  if (!currentDocState || currentDocState.docId !== docId) {
    return;
  }

  sections.forEach((section) => {
    section.renderedHtml = section.renderedHtml || "";
    currentDocState.sectionIndexById.set(section.sectionId, currentDocState.sections.length);
    currentDocState.sections.push(section);
  });
  renderAllSections();
}

function buildHeadingTree(flatToc) {
  const root = { children: [], level: 0 };
  const stack = [root];
  for (const item of flatToc) {
    const level = Math.max(1, Math.min(6, item.headerLevel || 1));
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const node = { item, children: [], level };
    parent.children.push(node);
    stack.push(node);
  }
  return root.children;
}

function makeTocBranch(node, defaultOpen) {
  const li = document.createElement("li");
  li.className = "nav-tree-branch";
  const row = document.createElement("div");
  row.className = "nav-tree-toc-row";
  const folderBtn = document.createElement("button");
  folderBtn.type = "button";
  folderBtn.className = "nav-tree-folder-btn nav-tree-folder-btn--square";
  folderBtn.setAttribute("aria-expanded", String(defaultOpen));
  folderBtn.setAttribute("aria-label", "하위 섹션 펼치기");
  const chev = document.createElement("span");
  chev.className = "nav-tree-chevron";
  chev.setAttribute("aria-hidden", "true");
  chev.textContent = defaultOpen ? "▼" : "▶";
  folderBtn.appendChild(chev);
  const linkBtn = document.createElement("button");
  linkBtn.type = "button";
  linkBtn.className = "nav-tree-link nav-tree-link--flex";
  linkBtn.textContent = node.item.headerText;
  linkBtn.addEventListener("click", () => {
    scrollToSection(node.item.sectionId);
  });
  const nestedUl = document.createElement("ul");
  nestedUl.className = "nav-tree nav-tree-nested";
  nestedUl.hidden = !defaultOpen;
  folderBtn.addEventListener("click", () => {
    const willShow = nestedUl.hidden;
    nestedUl.hidden = !willShow;
    folderBtn.setAttribute("aria-expanded", String(willShow));
    chev.textContent = willShow ? "▼" : "▶";
  });
  row.appendChild(folderBtn);
  row.appendChild(linkBtn);
  li.appendChild(row);
  li.appendChild(nestedUl);
  return { li, nestedUl };
}

function renderTocNodes(nodes, ul, depth) {
  for (const node of nodes) {
    if (node.children.length) {
      const { li, nestedUl } = makeTocBranch(node, depth < 2);
      renderTocNodes(node.children, nestedUl, depth + 1);
      ul.appendChild(li);
    } else {
      const li = document.createElement("li");
      li.className = "nav-tree-leaf";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-tree-link";
      btn.textContent = node.item.headerText;
      btn.addEventListener("click", () => {
        scrollToSection(node.item.sectionId);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }
}

function renderToc(meta) {
  const toc = meta?.toc || [];
  tocList.innerHTML = "";
  if (!toc.length) {
    renderNavEmpty(tocList, "No headings found");
    return;
  }
  const tree = buildHeadingTree(toc);
  renderTocNodes(tree, tocList, 0);
}

function getSectionHtml(section) {
  if (!section.renderedHtml) {
    section.renderedHtml = renderMarkdown(section.markdown || section.plainTextPreview || "");
  }
  return section.renderedHtml;
}

function renderAllSections() {
  if (!currentDocState || !contentRoot) {
    return;
  }
  contentRoot.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const section of currentDocState.sections) {
    const container = document.createElement("section");
    container.className = "md-section";
    container.id = section.sectionId;
    container.innerHTML = getSectionHtml(section);
    fragment.appendChild(container);
  }
  contentRoot.appendChild(fragment);
  if (pendingTocSectionId) {
    const target = document.getElementById(pendingTocSectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingTocSectionId = null;
    }
  }
}

function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  pendingTocSectionId = sectionId;
}

async function parseAndRenderText({
  text,
  docId,
  fileName,
  fileSize,
  fileLastModified = 0,
  sourceUrl = "",
  sourceType = "fileHandle"
}) {
  currentRawText = text;
  resetRenderState(
    docId,
    {
      name: fileName,
      size: fileSize,
      lastModified: fileLastModified
    },
    sourceUrl,
    sourceType
  );
  updateStatus(`Parsing: ${fileName} (${fileSize.toLocaleString()} bytes) / docId: ${docId}`);
  parserWorker.postMessage({
    type: "PARSE_REQUEST",
    docId,
    text,
    splitStrategy: "h1_h3_then_line_chunk"
  });
}

function materializeCachedSections(cachedSections) {
  return cachedSections.map((row) => ({
    sectionId: row.sectionId,
    order: row.order,
    headerLevel: row.headerLevel,
    headerText: row.headerText,
    startOffset: row.range?.start ?? 0,
    endOffset: row.range?.end ?? 0,
    markdown: "",
    plainTextPreview: row.plainTextPreview || "",
    renderedHtml: row.html || ""
  }));
}

function isFileChanged(cachedFileMeta, file) {
  if (!cachedFileMeta) {
    return true;
  }
  return (
    Number(cachedFileMeta.lastModified || 0) !== Number(file.lastModified || 0) ||
    Number(cachedFileMeta.size || 0) !== Number(file.size || 0)
  );
}

async function renderFromCache({ docId, file, sourceUrl = "", sourceType = "fileHandle" }) {
  const cached = await getDocumentCache(docId);
  if (!cached) {
    return { loaded: false, stale: true };
  }

  currentRawText = "";
  resetRenderState(docId, file, sourceUrl, sourceType);
  appendSections(docId, materializeCachedSections(cached.sections));
  renderToc({ toc: cached.doc.toc || [] });
  currentDocState.toc = cached.doc.toc || [];
  await touchDocument(docId, {
    title: file.name,
    sourceType,
    sourceUrl: sourceUrl || ""
  });
  const stale = sourceType === "fileUrl" ? false : isFileChanged(cached.doc.fileMeta, file);
  updateStatus(
    stale
      ? `Loaded from cache: ${file.name}. Refreshing in background...`
      : `Loaded from cache: ${file.name} (${file.size.toLocaleString()} bytes)`
  );
  await loadPresetForDoc(docId);
  await refreshPresetSelect(docId);
  return { loaded: true, stale };
}

async function parseAndRenderDocument(file, docId, sourceUrl = "") {
  const sourceType = sourceUrl ? "fileUrl" : "fileHandle";
  const cachedResult = await renderFromCache({ docId, file, sourceUrl, sourceType });
  if (cachedResult.loaded && !cachedResult.stale) {
    return;
  }

  const text = await file.text();
  currentRawText = text;
  await parseAndRenderText({
    text,
    docId,
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified || 0,
    sourceUrl,
    sourceType
  });
}

async function saveCurrentDocCache(toc = []) {
  if (!currentDocState?.docId || !currentDocState.sections.length) {
    return;
  }

  const sections = currentDocState.sections.map((section) => ({
    sectionId: section.sectionId,
    order: section.order,
    headerLevel: section.headerLevel ?? null,
    headerText: section.headerText || "",
    startOffset: section.startOffset ?? 0,
    endOffset: section.endOffset ?? 0,
    plainTextPreview: section.plainTextPreview || "",
    html: getSectionHtml(section)
  }));

  await saveDocumentCache({
    docId: currentDocState.docId,
    title: currentDocState.fileName,
    sourceType: currentDocState.sourceType || "fileHandle",
    sourceUrl: currentDocState.sourceUrl || "",
    fileMeta: {
      name: currentDocState.fileName,
      size: currentDocState.fileSize,
      lastModified: currentDocState.fileLastModified || 0
    },
    toc: toc || currentDocState.toc || [],
    sections
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
      fileLastModified: 0,
      sourceUrl,
      sourceType: "fileUrl"
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

presetSelect.addEventListener("change", () => void onPresetChange());
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
    currentDocState.toc = meta?.toc || [];
    updateStatus(
      `Loaded: ${currentDocState.fileName} (${currentDocState.fileSize.toLocaleString()} bytes) / ${currentDocState.sections.length} sections`
    );
    void loadPresetForDoc(currentDocState.docId).then(() => refreshPresetSelect(currentDocState.docId));
    void saveCurrentDocCache(currentDocState.toc).catch((cacheError) => {
      console.error(cacheError);
    });
    return;
  }

  if (type === "PARSE_ERROR") {
    console.error(error);
    contentRoot.innerHTML = `<pre>${escapeHtml(currentRawText)}</pre>`;
    updateStatus("Parser error. See console.");
  }
});

window.addEventListener("pagehide", () => {
  void setCacheMeta("lastCleanupRequestAt", Date.now()).catch((error) => {
    console.error(error);
  });
});

async function initializeViewer() {
  setupSidebarTabs();
  await ensureDefaultPreset();
  await refreshPresetSelect(null);
  await loadAndRenderRecents();
  const sourceUrl = getSourceUrlFromQuery();
  if (sourceUrl) {
    await openFromSourceUrl(sourceUrl);
  }
}

void initializeViewer();
