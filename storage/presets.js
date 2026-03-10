import {
  getAllPresets,
  getPreset,
  putPreset,
  deletePreset as dbDeletePreset,
  getDocPreset as dbGetDocPreset,
  setDocPreset as dbSetDocPreset,
  clearDocPreset as dbClearDocPreset
} from "./db.js";

export const DEFAULT_PRESET_ID = "default";

/** PRD FR-04: 폰트 패밀리, 기본 글자 크기, 라인하이트, 콘텐츠 폭, 태그별 스타일 등 */
export const DEFAULT_STYLE_JSON = {
  fontFamily: '"Segoe UI", "Noto Sans KR", sans-serif',
  fontSize: "15px",
  lineHeight: "1.6",
  contentMaxWidth: "none",
  codeFontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
  tags: {
    h1: { fontSize: "1.75em", fontWeight: "700", marginTop: "0.5em", marginBottom: "0.4em" },
    h2: { fontSize: "1.4em", fontWeight: "600", marginTop: "0.6em", marginBottom: "0.35em" },
    h3: { fontSize: "1.2em", fontWeight: "600", marginTop: "0.5em", marginBottom: "0.3em" },
    h4: { fontSize: "1.1em", fontWeight: "600", marginTop: "0.4em", marginBottom: "0.25em" },
    h5: { fontSize: "1em", fontWeight: "600", marginTop: "0.35em", marginBottom: "0.2em" },
    h6: { fontSize: "0.95em", fontWeight: "600", marginTop: "0.3em", marginBottom: "0.2em" },
    p: { fontSize: "1em", marginTop: "0.5em", marginBottom: "0.5em" },
    code: { fontSize: "0.9em", fontFamily: null },
    pre: { padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc" },
    blockquote: { borderLeft: "4px solid #cbd5e1", padding: "8px 12px", background: "#f8fafc" },
    table: { borderCollapse: "collapse" },
    th: { border: "1px solid #dbe3ef", padding: "8px 10px" },
    td: { border: "1px solid #dbe3ef", padding: "8px 10px" }
  }
};

function generatePresetId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 프리셋이 하나도 없으면 기본 프리셋 생성 */
export async function ensureDefaultPreset() {
  const list = await getAllPresets();
  if (list.length > 0) {
    return list.find((p) => p.presetId === DEFAULT_PRESET_ID) || list[0];
  }
  const now = Date.now();
  await putPreset({
    presetId: DEFAULT_PRESET_ID,
    name: "Default",
    version: 1,
    styleJson: { ...DEFAULT_STYLE_JSON },
    createdAt: now,
    updatedAt: now
  });
  return await getPreset(DEFAULT_PRESET_ID);
}

export async function listPresets() {
  const list = await getAllPresets();
  if (list.length === 0) {
    await ensureDefaultPreset();
    return await getAllPresets();
  }
  return list;
}

export async function getPresetOrDefault(presetId) {
  if (!presetId) {
    return await getPreset(DEFAULT_PRESET_ID) || (await ensureDefaultPreset());
  }
  const p = await getPreset(presetId);
  return p || (await getPreset(DEFAULT_PRESET_ID)) || (await ensureDefaultPreset());
}

export { getPreset };

export async function createPreset({ name = "New Preset", styleJson } = {}) {
  const presetId = generatePresetId();
  const now = Date.now();
  await putPreset({
    presetId,
    name,
    version: 1,
    styleJson: styleJson ? { ...DEFAULT_STYLE_JSON, ...styleJson } : { ...DEFAULT_STYLE_JSON },
    createdAt: now,
    updatedAt: now
  });
  return await getPreset(presetId);
}

export async function updatePreset(presetId, updates) {
  const existing = await getPreset(presetId);
  if (!existing) {
    return null;
  }
  const styleJson = updates.styleJson !== undefined ? updates.styleJson : existing.styleJson;
  const name = updates.name !== undefined ? updates.name : existing.name;
  await putPreset({
    ...existing,
    name,
    styleJson: typeof styleJson === "object" && styleJson !== null ? { ...existing.styleJson, ...styleJson } : styleJson,
    updatedAt: Date.now()
  });
  return await getPreset(presetId);
}

export async function deletePreset(presetId) {
  if (presetId === DEFAULT_PRESET_ID) {
    return;
  }
  await dbDeletePreset(presetId);
}

export async function duplicatePreset(presetId) {
  const source = await getPreset(presetId);
  if (!source) {
    return null;
  }
  return await createPreset({
    name: `Copy of ${source.name}`,
    styleJson: JSON.parse(JSON.stringify(source.styleJson || DEFAULT_STYLE_JSON))
  });
}

export async function getDocPreset(docId) {
  return await dbGetDocPreset(docId);
}

export async function setDocPreset(docId, presetId) {
  await dbSetDocPreset(docId, presetId);
}

export async function clearDocPreset(docId) {
  await dbClearDocPreset(docId);
}
