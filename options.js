import {
  listPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  duplicatePreset,
  ensureDefaultPreset,
  DEFAULT_PRESET_ID,
  DEFAULT_STYLE_JSON
} from "./storage/presets.js";

const presetList = document.getElementById("preset-list");
const presetCreateBtn = document.getElementById("preset-create-btn");
const presetEditBtn = document.getElementById("preset-edit-btn");
const presetDuplicateBtn = document.getElementById("preset-duplicate-btn");
const presetDeleteBtn = document.getElementById("preset-delete-btn");
const presetEditor = document.getElementById("preset-editor");
const presetEditorTitle = document.getElementById("preset-editor-title");
const presetEditId = document.getElementById("preset-edit-id");
const presetName = document.getElementById("preset-name");
const presetStyleJson = document.getElementById("preset-style-json");
const presetResetStyleBtn = document.getElementById("preset-reset-style-btn");
const presetSaveBtn = document.getElementById("preset-save-btn");
const presetCancelBtn = document.getElementById("preset-cancel-btn");

let selectedPresetId = null;

function getSelectedId() {
  return presetList.querySelector("li.selected")?.dataset?.presetId ?? null;
}

function formatStyleJson(obj) {
  return JSON.stringify(obj, null, 2);
}

function parseStyleJson(str) {
  try {
    return JSON.parse(str || "{}");
  } catch (_e) {
    return null;
  }
}

async function renderPresetList() {
  const presets = await listPresets();
  presetList.innerHTML = "";
  for (const p of presets) {
    const li = document.createElement("li");
    li.dataset.presetId = p.presetId;
    li.textContent = p.name + (p.presetId === DEFAULT_PRESET_ID ? " (default)" : "");
    if (p.presetId === selectedPresetId) {
      li.classList.add("selected");
    }
    li.addEventListener("click", () => {
      presetList.querySelectorAll("li").forEach((el) => el.classList.remove("selected"));
      li.classList.add("selected");
      selectedPresetId = p.presetId;
      presetEditBtn.disabled = false;
      presetDuplicateBtn.disabled = false;
      presetDeleteBtn.disabled = p.presetId === DEFAULT_PRESET_ID;
    });
    presetList.appendChild(li);
  }
  if (!selectedPresetId && presets.length > 0) {
    presetEditBtn.disabled = true;
    presetDuplicateBtn.disabled = true;
    presetDeleteBtn.disabled = true;
  }
}

function showEditor(mode, preset = null) {
  presetEditor.classList.remove("hidden");
  presetEditorTitle.textContent = mode === "create" ? "New Preset" : "Edit Preset";
  presetEditId.value = preset?.presetId ?? "";
  presetName.value = preset?.name ?? "New Preset";
  presetStyleJson.value = formatStyleJson(preset?.styleJson ?? DEFAULT_STYLE_JSON);
}

function hideEditor() {
  presetEditor.classList.add("hidden");
  presetEditId.value = "";
  presetName.value = "";
  presetStyleJson.value = "";
}

presetCreateBtn.addEventListener("click", () => {
  showEditor("create", { name: "New Preset", styleJson: { ...DEFAULT_STYLE_JSON } });
});

presetEditBtn.addEventListener("click", async () => {
  const id = getSelectedId();
  if (!id) return;
  const preset = await getPreset(id);
  if (!preset) return;
  showEditor("edit", preset);
});

presetDuplicateBtn.addEventListener("click", async () => {
  const id = getSelectedId();
  if (!id) return;
  const created = await duplicatePreset(id);
  if (created) {
    selectedPresetId = created.presetId;
    await renderPresetList();
    showEditor("edit", created);
  }
});

presetDeleteBtn.addEventListener("click", async () => {
  const id = getSelectedId();
  if (!id || id === DEFAULT_PRESET_ID) return;
  if (!confirm(`Delete preset "${(await getPreset(id))?.name}"?`)) return;
  await deletePreset(id);
  selectedPresetId = null;
  await renderPresetList();
});

presetResetStyleBtn.addEventListener("click", () => {
  presetStyleJson.value = formatStyleJson(DEFAULT_STYLE_JSON);
});

presetSaveBtn.addEventListener("click", async () => {
  const id = presetEditId.value.trim();
  const name = presetName.value.trim() || "Unnamed";
  const styleJson = parseStyleJson(presetStyleJson.value);
  if (styleJson === null) {
    alert("Invalid JSON in Style field.");
    return;
  }
  if (id) {
    await updatePreset(id, { name, styleJson });
  } else {
    await createPreset({ name, styleJson });
  }
  hideEditor();
  await renderPresetList();
});

presetCancelBtn.addEventListener("click", hideEditor);

async function init() {
  await ensureDefaultPreset();
  await renderPresetList();
}

init().catch((e) => console.error(e));
