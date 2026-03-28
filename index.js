/**
 * Prompt Set Manager — SillyTavern Extension
 * Saves and restores named presets of Prompt Manager enabled/disabled states.
 * Works like Regex Preset sets but for the Prompt Manager.
 */

import { extension_settings } from "../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const EXT_KEY      = "prompt_set_manager";
const PANEL_ID     = "psm-main-panel";
const VERSION      = "1.1.0";

// ─── Settings Helpers ────────────────────────────────────────────────────────

function getSettings() {
    if (!extension_settings[EXT_KEY]) {
        extension_settings[EXT_KEY] = { sets: [], hotkey: "" };
    }
    const s = extension_settings[EXT_KEY];
    if (!Array.isArray(s.sets))  s.sets    = [];
    if (s.hotkey === undefined)  s.hotkey  = "";
    return s;
}

function persistSettings() {
    try { saveSettingsDebounced(); }
    catch (_) { window.saveSettingsDebounced?.(); }
}

// ─── Prompt Data Access ──────────────────────────────────────────────────────

/** Returns { identifier: boolean } map of current prompt enabled states */
function readPromptStates() {
    const states = {};

    // ── Primary: oai_settings.prompts (OpenAI-compatible APIs) ──
    const prompts = window.oai_settings?.prompts;
    if (Array.isArray(prompts) && prompts.length > 0) {
        for (const p of prompts) {
            if (p.identifier != null) {
                states[p.identifier] = p.enabled !== false;
            }
        }
        return states;
    }

    // ── Fallback: read from live DOM when PM dialog is open ──
    $("[data-pm-identifier]").each(function () {
        const id = $(this).data("pm-identifier");
        const cb = $(this).find('input[type="checkbox"]').first();
        if (id != null) {
            states[String(id)] = cb.length ? cb.prop("checked") : true;
        }
    });

    return states;
}

/** Returns { identifier: displayName } map */
function readPromptNames() {
    const names = {};
    const prompts = window.oai_settings?.prompts;
    if (Array.isArray(prompts)) {
        for (const p of prompts) {
            if (p.identifier != null) {
                names[String(p.identifier)] = p.name || String(p.identifier);
            }
        }
    }
    return names;
}

/**
 * Apply a saved states map back to oai_settings and the live DOM.
 * Identifiers NOT present in the saved set are left unchanged.
 */
function applyPromptStates(states) {
    // ── Write to oai_settings ──
    const prompts = window.oai_settings?.prompts;
    if (Array.isArray(prompts)) {
        for (const p of prompts) {
            const id = String(p.identifier ?? "");
            if (id && Object.prototype.hasOwnProperty.call(states, id)) {
                p.enabled = states[id];
            }
        }
    }

    // ── Sync live DOM (if prompt manager dialog is open) ──
    for (const [rawId, enabled] of Object.entries(states)) {
        const safeId = CSS.escape ? CSS.escape(rawId) : rawId.replace(/[^\w-]/g, "\\$&");
        const entry  = $(`[data-pm-identifier="${safeId}"]`);
        if (!entry.length) continue;
        const cb = entry.find('input[type="checkbox"]').first();
        if (cb.length && cb.prop("checked") !== enabled) {
            cb.prop("checked", enabled).trigger("change");
        }
    }

    // ── Ask the prompt manager to refresh its UI ──
    refreshPromptManagerUI();

    persistSettings();
}

function refreshPromptManagerUI() {
    // Try the global promptManager instance (ST exposes this in some versions)
    const pm = window.promptManager;
    if (pm && typeof pm.render === "function") {
        try { pm.render(); return; } catch (_) {}
    }
    // Generic fallback: fire a settings-changed event
    $(document).trigger("settings_updated");
}

// ─── Set CRUD ────────────────────────────────────────────────────────────────

function createSet(name) {
    const states = readPromptStates();

    if (Object.keys(states).length === 0) {
        return {
            ok: false,
            error: "No prompts found. Make sure a Prompt-Manager-compatible API is active and prompts are configured.",
        };
    }

    const set = {
        id:         `psm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name:       name.trim(),
        prompts:    states,
        savedAt:    new Date().toISOString(),
    };

    getSettings().sets.push(set);
    persistSettings();
    return { ok: true, set };
}

function overwriteSet(id) {
    const settings = getSettings();
    const set = settings.sets.find(s => s.id === id);
    if (!set) return false;

    const states = readPromptStates();
    if (Object.keys(states).length === 0) return false;

    set.prompts = states;
    set.savedAt = new Date().toISOString();
    persistSettings();
    return true;
}

function renameSet(id, newName) {
    const set = getSettings().sets.find(s => s.id === id);
    if (!set || !newName?.trim()) return false;
    set.name = newName.trim();
    persistSettings();
    return true;
}

function removeSet(id) {
    const settings = getSettings();
    const idx = settings.sets.findIndex(s => s.id === id);
    if (idx === -1) return false;
    settings.sets.splice(idx, 1);
    persistSettings();
    return true;
}

function moveSet(id, direction) {
    const sets = getSettings().sets;
    const idx  = sets.findIndex(s => s.id === id);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sets.length) return;
    [sets[idx], sets[swapIdx]] = [sets[swapIdx], sets[idx]];
    persistSettings();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const html = (str) => $("<div>").text(String(str)).html();
const attr = (str) => String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch (_) { return iso ?? ""; }
}

function setStats(set) {
    const entries  = Object.entries(set.prompts ?? {});
    const onCount  = entries.filter(([, v]) => v).length;
    const offCount = entries.length - onCount;
    return { total: entries.length, onCount, offCount };
}

function setTooltip(set, names) {
    const entries = Object.entries(set.prompts ?? {});
    const on  = entries.filter(([, v]) =>  v).map(([k]) => "✓ " + (names[k] ?? k));
    const off = entries.filter(([, v]) => !v).map(([k]) => "✗ " + (names[k] ?? k));
    return [...on, ...off].join("\n") || "Empty set";
}

// ─── UI Rendering ────────────────────────────────────────────────────────────

const PANEL_SKELETON = /* html */`
<div id="${PANEL_ID}" class="psm-panel">

  <div class="psm-topbar">
    <span class="psm-logo"><i class="fa-solid fa-layer-group"></i> Prompt Sets</span>
    <div class="psm-topbar-actions">
      <button class="psm-icon-btn" id="psm-save-new-btn" title="Save current state as new set">
        <i class="fa-solid fa-floppy-disk"></i>
        <span>Save Current</span>
      </button>
    </div>
  </div>

  <div class="psm-body">
    <div class="psm-empty" id="psm-empty">
      <i class="fa-solid fa-box-open"></i>
      <p>No sets saved yet.</p>
      <small>Configure your prompts, then click <strong>Save Current</strong>.</small>
    </div>
    <ul class="psm-list" id="psm-list"></ul>
  </div>

  <div class="psm-footer">
    <label class="psm-hotkey-label">
      <i class="fa-solid fa-keyboard"></i>
      Quick-access hotkey:
      <input type="text" id="psm-hotkey-input" class="psm-hotkey-input text_pole" placeholder="e.g. Alt+Shift+P" maxlength="30" />
    </label>
    <small class="psm-version">v${VERSION}</small>
  </div>

</div>
`;

function buildSetItem(set, names) {
    const { onCount, offCount } = setStats(set);
    const tip = attr(setTooltip(set, names));
    const dateStr = formatDate(set.savedAt);

    return /* html */`
    <li class="psm-set-item" data-set-id="${attr(set.id)}">
      <div class="psm-set-drag-handle" title="Drag to reorder">
        <i class="fa-solid fa-grip-vertical"></i>
      </div>

      <div class="psm-set-info" title="${tip}">
        <span class="psm-set-name">${html(set.name)}</span>
        <div class="psm-set-meta">
          <span class="psm-badge psm-on">${onCount} on</span>
          <span class="psm-badge psm-off">${offCount} off</span>
          <span class="psm-date">${html(dateStr)}</span>
        </div>
      </div>

      <div class="psm-set-btns">
        <button class="psm-btn psm-apply-btn" data-action="apply"     title="Apply this set">
          <i class="fa-solid fa-play"></i>
        </button>
        <button class="psm-btn psm-rename-btn" data-action="rename"   title="Rename">
          <i class="fa-solid fa-pencil"></i>
        </button>
        <button class="psm-btn psm-update-btn" data-action="overwrite" title="Overwrite with current prompt state">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
        <button class="psm-btn psm-up-btn" data-action="up"           title="Move up">
          <i class="fa-solid fa-chevron-up"></i>
        </button>
        <button class="psm-btn psm-down-btn" data-action="down"       title="Move down">
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <button class="psm-btn psm-del-btn" data-action="delete"      title="Delete set">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </li>`;
}

function renderPanel() {
    const settings = getSettings();
    const names    = readPromptNames();
    const list     = $("#psm-list");
    const empty    = $("#psm-empty");

    if (!list.length) return;

    list.empty();

    if (settings.sets.length === 0) {
        empty.show();
        list.hide();
        return;
    }

    empty.hide();
    list.show();
    settings.sets.forEach(set => list.append(buildSetItem(set, names)));

    // Restore hotkey input
    $("#psm-hotkey-input").val(settings.hotkey ?? "");
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────

function wireEvents() {
    const $panel = $(`#${PANEL_ID}`);

    // ── Save new set ──
    $panel.on("click", "#psm-save-new-btn", () => {
        const settings = getSettings();
        const defaultName = `Set ${settings.sets.length + 1}`;
        const name = prompt("Name for this set:", defaultName);
        if (!name?.trim()) return;

        const result = createSet(name);
        if (result.ok) {
            toastr.success(`Saved "${result.set.name}"`, "Prompt Sets");
            renderPanel();
        } else {
            toastr.error(result.error, "Prompt Sets");
        }
    });

    // ── Per-set actions ──
    $panel.on("click", ".psm-set-btns [data-action]", function () {
        const action = $(this).data("action");
        const id     = $(this).closest(".psm-set-item").data("set-id");
        const set    = getSettings().sets.find(s => s.id === id);
        if (!set) return;

        switch (action) {
            case "apply": {
                applyPromptStates(set.prompts);
                toastr.success(`Applied: "${set.name}"`, "Prompt Sets");
                // Flash the item green briefly
                $(this).closest(".psm-set-item").addClass("psm-flash");
                setTimeout(() => $(`.psm-set-item[data-set-id="${id}"]`).removeClass("psm-flash"), 700);
                break;
            }
            case "rename": {
                const newName = prompt("Rename set:", set.name);
                if (!newName?.trim()) return;
                renameSet(id, newName);
                toastr.info(`Renamed to "${newName.trim()}"`, "Prompt Sets");
                renderPanel();
                break;
            }
            case "overwrite": {
                if (!confirm(`Overwrite "${set.name}" with the current prompt states?`)) return;
                if (overwriteSet(id)) {
                    toastr.success(`Updated "${set.name}"`, "Prompt Sets");
                    renderPanel();
                } else {
                    toastr.error("No prompts found to save.", "Prompt Sets");
                }
                break;
            }
            case "up":
                moveSet(id, -1);
                renderPanel();
                break;
            case "down":
                moveSet(id, +1);
                renderPanel();
                break;
            case "delete": {
                if (!confirm(`Delete set "${set.name}"?`)) return;
                removeSet(id);
                toastr.info(`Deleted "${set.name}"`, "Prompt Sets");
                renderPanel();
                break;
            }
        }
    });

    // ── Hotkey config ──
    $panel.on("change", "#psm-hotkey-input", function () {
        getSettings().hotkey = $(this).val().trim();
        persistSettings();
        registerHotkey();
    });
}

// ─── Keyboard Shortcut ───────────────────────────────────────────────────────

let _hotkeyHandler = null;

function parseHotkey(str) {
    if (!str) return null;
    const parts = str.toLowerCase().split("+").map(s => s.trim());
    return {
        key:   parts[parts.length - 1],
        ctrl:  parts.includes("ctrl"),
        alt:   parts.includes("alt"),
        shift: parts.includes("shift"),
        meta:  parts.includes("meta"),
    };
}

function registerHotkey() {
    if (_hotkeyHandler) {
        document.removeEventListener("keydown", _hotkeyHandler);
        _hotkeyHandler = null;
    }

    const combo = parseHotkey(getSettings().hotkey);
    if (!combo) return;

    _hotkeyHandler = (e) => {
        if (e.key.toLowerCase() !== combo.key) return;
        if (e.ctrlKey  !== combo.ctrl)  return;
        if (e.altKey   !== combo.alt)   return;
        if (e.shiftKey !== combo.shift) return;
        if (e.metaKey  !== combo.meta)  return;

        // Toggle the Extensions panel drawer where PSM lives
        const drawer = $("#psm-drawer-header");
        if (drawer.length) {
            drawer.trigger("click");
        }
        e.preventDefault();
    };

    document.addEventListener("keydown", _hotkeyHandler);
}

// ─── Inject into Extensions Settings ────────────────────────────────────────

function injectExtensionUI() {
    if ($(`#${PANEL_ID}`).length) {
        renderPanel();
        return;
    }

    // SillyTavern uses inline-drawer pattern for extension settings
    const drawerHtml = /* html */`
    <div class="inline-drawer" id="psm-drawer">
      <div class="inline-drawer-toggle inline-drawer-header" id="psm-drawer-header">
        <b><i class="fa-solid fa-layer-group"></i> Prompt Set Manager</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content" id="psm-drawer-content">
        ${PANEL_SKELETON}
      </div>
    </div>`;

    // Try common extension settings containers
    const $target = $("#extensions_settings2, #extensions_settings").first();
    if ($target.length) {
        $target.append(drawerHtml);
    } else {
        // Last-resort fallback
        $("body").append(`<div style="display:none" id="psm-hidden-root">${drawerHtml}</div>`);
    }

    wireEvents();
    renderPanel();
    registerHotkey();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

jQuery(async () => {
    console.log("[Prompt Set Manager] Loading v" + VERSION);
    getSettings(); // ensure structure exists

    // Inject once DOM is ready
    injectExtensionUI();

    // Re-inject if ST rebuilds the extension panel (e.g., on settings reload)
    $(document).on("extensions_updated", () => {
        if (!$(`#${PANEL_ID}`).length) injectExtensionUI();
    });

    console.log("[Prompt Set Manager] Ready.");
});
