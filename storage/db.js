export const DB_NAME = "md_viewer_v1";
const DB_VERSION = 2;
const DOCS_STORE = "docs";
const SECTIONS_STORE = "sections";
const CACHE_META_STORE = "cache_meta";
const PRESETS_STORE = "presets";
const DOC_PRESET_STORE = "doc_preset";

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

function ensureStore(db, storeName, options) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName, options);
  }
}

export async function openDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ensureStore(db, DOCS_STORE, { keyPath: "docId" });
      ensureStore(db, SECTIONS_STORE, { keyPath: "pk" });
      ensureStore(db, CACHE_META_STORE, { keyPath: "key" });
      ensureStore(db, PRESETS_STORE, { keyPath: "presetId" });
      ensureStore(db, DOC_PRESET_STORE, { keyPath: "docId" });

      const docsStore = request.transaction.objectStore(DOCS_STORE);
      if (!docsStore.indexNames.contains("lastOpenedAt")) {
        docsStore.createIndex("lastOpenedAt", "lastOpenedAt", { unique: false });
      }

      const sectionsStore = request.transaction.objectStore(SECTIONS_STORE);
      if (!sectionsStore.indexNames.contains("docId")) {
        sectionsStore.createIndex("docId", "docId", { unique: false });
      }
      if (!sectionsStore.indexNames.contains("docId_order")) {
        sectionsStore.createIndex("docId_order", ["docId", "order"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function deleteSectionsByDocId(tx, docId) {
  const sectionStore = tx.objectStore(SECTIONS_STORE);
  const index = sectionStore.index("docId");
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.only(docId);
    const cursorRequest = index.openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

export async function getDocumentCache(docId) {
  const db = await openDb();
  const tx = db.transaction([DOCS_STORE, SECTIONS_STORE], "readonly");
  const docStore = tx.objectStore(DOCS_STORE);
  const sectionIndex = tx.objectStore(SECTIONS_STORE).index("docId");

  const [doc, sections] = await Promise.all([
    requestToPromise(docStore.get(docId)),
    requestToPromise(sectionIndex.getAll(IDBKeyRange.only(docId)))
  ]);
  await transactionToPromise(tx);

  if (!doc || !sections.length) {
    return null;
  }

  sections.sort((a, b) => a.order - b.order);
  return { doc, sections };
}

export async function saveDocumentCache(snapshot) {
  const db = await openDb();
  const tx = db.transaction([DOCS_STORE, SECTIONS_STORE], "readwrite");
  const docStore = tx.objectStore(DOCS_STORE);
  const sectionStore = tx.objectStore(SECTIONS_STORE);
  const updatedAt = Date.now();

  await deleteSectionsByDocId(tx, snapshot.docId);
  docStore.put({
    docId: snapshot.docId,
    title: snapshot.title,
    lastOpenedAt: updatedAt,
    sourceType: snapshot.sourceType,
    sourceUrl: snapshot.sourceUrl || "",
    fileMeta: snapshot.fileMeta || null,
    toc: snapshot.toc || [],
    updatedAt
  });

  (snapshot.sections || []).forEach((section) => {
    sectionStore.put({
      pk: `${snapshot.docId}::${section.sectionId}`,
      docId: snapshot.docId,
      sectionId: section.sectionId,
      order: section.order,
      html: section.html || "",
      plainTextPreview: section.plainTextPreview || "",
      headerLevel: section.headerLevel ?? null,
      headerText: section.headerText || "",
      range: {
        start: section.startOffset ?? 0,
        end: section.endOffset ?? 0
      },
      updatedAt
    });
  });

  await transactionToPromise(tx);
}

export async function touchDocument(docId, updates = {}) {
  const db = await openDb();
  const tx = db.transaction(DOCS_STORE, "readwrite");
  const store = tx.objectStore(DOCS_STORE);
  const existing = await requestToPromise(store.get(docId));
  if (existing) {
    store.put({
      ...existing,
      ...updates,
      lastOpenedAt: Date.now()
    });
  }
  await transactionToPromise(tx);
}

export async function setCacheMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction(CACHE_META_STORE, "readwrite");
  tx.objectStore(CACHE_META_STORE).put({ key, value, updatedAt: Date.now() });
  await transactionToPromise(tx);
}

// --- Presets ---
export async function getAllPresets() {
  const db = await openDb();
  const tx = db.transaction(PRESETS_STORE, "readonly");
  const list = await requestToPromise(tx.objectStore(PRESETS_STORE).getAll());
  await transactionToPromise(tx);
  return list;
}

export async function getPreset(presetId) {
  const db = await openDb();
  const tx = db.transaction(PRESETS_STORE, "readonly");
  const row = await requestToPromise(tx.objectStore(PRESETS_STORE).get(presetId));
  await transactionToPromise(tx);
  return row || null;
}

export async function putPreset(preset) {
  const db = await openDb();
  const now = Date.now();
  const tx = db.transaction(PRESETS_STORE, "readwrite");
  const store = tx.objectStore(PRESETS_STORE);
  const toPut = {
    presetId: preset.presetId,
    name: preset.name ?? "Unnamed",
    version: preset.version ?? 1,
    styleJson: preset.styleJson ?? {},
    createdAt: preset.createdAt ?? now,
    updatedAt: now
  };
  store.put(toPut);
  await transactionToPromise(tx);
  return toPut;
}

export async function deletePreset(presetId) {
  const db = await openDb();
  const tx = db.transaction(PRESETS_STORE, "readwrite");
  tx.objectStore(PRESETS_STORE).delete(presetId);
  await transactionToPromise(tx);
}

// --- Doc-Preset mapping ---
export async function getDocPreset(docId) {
  const db = await openDb();
  const tx = db.transaction(DOC_PRESET_STORE, "readonly");
  const row = await requestToPromise(tx.objectStore(DOC_PRESET_STORE).get(docId));
  await transactionToPromise(tx);
  return row?.presetId ?? null;
}

export async function setDocPreset(docId, presetId) {
  const db = await openDb();
  const tx = db.transaction(DOC_PRESET_STORE, "readwrite");
  tx.objectStore(DOC_PRESET_STORE).put({ docId, presetId });
  await transactionToPromise(tx);
}

export async function clearDocPreset(docId) {
  const db = await openDb();
  const tx = db.transaction(DOC_PRESET_STORE, "readwrite");
  tx.objectStore(DOC_PRESET_STORE).delete(docId);
  await transactionToPromise(tx);
}
