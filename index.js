// ===================================================
//  Prompt Preset Panel — SillyTavern Extension
//  Quickly toggle named sets of Prompt Manager entries
// ===================================================

(function () {
  "use strict";

  const EXT_NAME = "prompt_preset_panel";
  const STORAGE_KEY = "PPP_presets_v2";

  // ── Helpers ──────────────────────────────────────

  function log(...args) {
    console.log("[PromptPresetPanel]", ...args);
  }

  function saveToStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      log("Storage save failed:", e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { presets: [] };
    } catch (e) {
      return { presets: [] };
    }
  }

  // ── Prompt Manager Interface ──────────────────────
  // Tries multiple strategies to read / toggle prompts.

  /**
   * Scan the Prompt Manager DOM for all entries.
   * Returns array of { identifier, name, enabled, element }
   */
  function scanPromptEntries() {
    const entries = [];

    // Strategy A: data-pm-identifier rows (ST ≥ 1.11)
    const rows = document.querySelectorAll("[data-pm-identifier]");
    if (rows.length > 0) {
      rows.forEach((row) => {
        const identifier = row.dataset.pmIdentifier;
        const nameEl =
          row.querySelector(".prompt_manager_prompt_name") ||
          row.querySelector("[class*='prompt'][class*='name']") ||
          row.querySelector("span");
        const toggleEl =
          row.querySelector(".prompt_manager_prompt_toggle input[type='checkbox']") ||
          row.querySelector("input[type='checkbox']") ||
          row.querySelector(".toggle_checkbox");

        const name = nameEl ? nameEl.textContent.trim() : identifier;
        const enabled = toggleEl ? toggleEl.checked : !row.classList.contains("disabled");

        if (identifier && name) {
          entries.push({ identifier, name, enabled, element: row, toggleEl });
        }
      });
      return entries;
    }

    // Strategy B: class-based rows (older ST)
    const classRows = document.querySelectorAll(
      ".prompt_manager_prompt, [class*='prompt_manager_prompt']"
    );
    classRows.forEach((row, idx) => {
      const nameEl = row.querySelector("[class*='name'], span, label");
      const toggleEl = row.querySelector("input[type='checkbox']");
      const name = nameEl ? nameEl.textContent.trim() : `Entry ${idx}`;
      const identifier =
        row.dataset.id ||
        row.id ||
        name.toLowerCase().replace(/\s+/g, "_") + "_" + idx;
      const enabled = toggleEl ? toggleEl.checked : !row.classList.contains("disabled");
      if (name) entries.push({ identifier, name, enabled, element: row, toggleEl });
    });

    return entries;
  }

  /**
   * Toggle a specific prompt entry by identifier.
   * enabled = true → turn ON, false → turn OFF
   */
  function setPromptEnabled(identifier, enabled) {
    // Strategy A: direct DOM toggle via checkbox
    const row = document.querySelector(`[data-pm-identifier="${CSS.escape(identifier)}"]`);
    if (row) {
      const cb = row.querySelector("input[type='checkbox']");
      if (cb && cb.checked !== enabled) {
        cb.click();
        return true;
      }
      // Toggle button pattern
      const btn = row.querySelector(
        ".prompt_manager_prompt_toggle, [class*='toggle']:not(input)"
      );
      if (btn && !cb) {
        const isEnabled = !row.classList.contains("disabled");
        if (isEnabled !== enabled) btn.click();
        return true;
      }
    }

    // Strategy B: find by name scan
    const entries = scanPromptEntries();
    const entry = entries.find((e) => e.identifier === identifier);
    if (entry && entry.toggleEl && entry.toggleEl.checked !== enabled) {
      entry.toggleEl.click();
      return true;
    }
    return false;
  }

  // ── Preset Logic ──────────────────────────────────

  let state = loadFromStorage();

  function getPresets() {
    return state.presets || [];
  }

  function savePresetFromCurrent(name, description = "") {
    const entries = scanPromptEntries();
    const snapshot = {};
    entries.forEach((e) => {
      snapshot[e.identifier] = { name: e.name, enabled: e.enabled };
    });

    const existing = state.presets.findIndex((p) => p.name === name);
    const preset = {
      id: existing >= 0 ? state.presets[existing].id : Date.now().toString(36),
      name,
      description,
      snapshot,
      createdAt: existing >= 0 ? state.presets[existing].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    if (existing >= 0) {
      state.presets[existing] = preset;
    } else {
      state.presets.push(preset);
    }
    saveToStorage(state);
    log(`Saved preset: "${name}" with ${Object.keys(snapshot).length} entries`);
    return preset;
  }

  function applyPreset(presetId) {
    const preset = state.presets.find((p) => p.id === presetId);
    if (!preset) return false;

    let toggled = 0;
    Object.entries(preset.snapshot).forEach(([identifier, data]) => {
      if (setPromptEnabled(identifier, data.enabled)) toggled++;
    });
    log(`Applied preset "${preset.name}": ${toggled} toggles fired`);
    return toggled;
  }

  function deletePreset(presetId) {
    state.presets = state.presets.filter((p) => p.id !== presetId);
    saveToStorage(state);
  }

  function renamePreset(presetId, newName) {
    const p = state.presets.find((p) => p.id === presetId);
    if (p) {
      p.name = newName;
      p.updatedAt = Date.now();
      saveToStorage(state);
    }
  }

  // ── UI Construction ───────────────────────────────

  const PANEL_ID = "ppp_panel";

  function buildPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) return existing;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ppp-drag-handle" id="ppp_drag_handle">
        <span class="ppp-icon">⚡</span>
        <span class="ppp-title">Prompt Preset Panel</span>
        <div class="ppp-header-actions">
          <button class="ppp-icon-btn" id="ppp_refresh" title="Refresh entry list">↺</button>
          <button class="ppp-icon-btn" id="ppp_minimize" title="Minimize">▾</button>
          <button class="ppp-icon-btn" id="ppp_close" title="Close">✕</button>
        </div>
      </div>

      <div class="ppp-body" id="ppp_body">
        <!-- Left: Presets list -->
        <div class="ppp-col ppp-col-presets">
          <div class="ppp-col-header">
            <span>Presets</span>
            <button class="ppp-btn ppp-btn-accent" id="ppp_save_new">＋ Save Current</button>
          </div>
          <div class="ppp-preset-list" id="ppp_preset_list">
            <div class="ppp-empty-hint">No presets yet.<br>Click <b>＋ Save Current</b> to create one.</div>
          </div>
        </div>

        <!-- Divider -->
        <div class="ppp-divider"></div>

        <!-- Right: Live entries -->
        <div class="ppp-col ppp-col-entries">
          <div class="ppp-col-header">
            <span>Live Entries</span>
            <span class="ppp-entry-count" id="ppp_entry_count">–</span>
          </div>
          <div class="ppp-entries-list" id="ppp_entries_list">
            <div class="ppp-empty-hint">Open the Prompt Manager first,<br>then click ↺ Refresh.</div>
          </div>
        </div>
      </div>

      <!-- Save dialog (hidden) -->
      <div class="ppp-dialog" id="ppp_dialog" style="display:none">
        <div class="ppp-dialog-inner">
          <div class="ppp-dialog-title" id="ppp_dialog_title">Save Preset</div>
          <input class="ppp-input" id="ppp_dialog_name" type="text" placeholder="Preset name…" maxlength="40" />
          <input class="ppp-input" id="ppp_dialog_desc" type="text" placeholder="Description (optional)" maxlength="80" />
          <div class="ppp-dialog-actions">
            <button class="ppp-btn ppp-btn-ghost" id="ppp_dialog_cancel">Cancel</button>
            <button class="ppp-btn ppp-btn-accent" id="ppp_dialog_ok">Save</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    attachPanelEvents(panel);
    return panel;
  }

  function attachPanelEvents(panel) {
    // Close
    panel.querySelector("#ppp_close").onclick = () => {
      panel.style.display = "none";
    };

    // Minimize toggle
    let minimized = false;
    panel.querySelector("#ppp_minimize").onclick = () => {
      minimized = !minimized;
      panel.querySelector("#ppp_body").style.display = minimized ? "none" : "";
      panel.querySelector("#ppp_minimize").textContent = minimized ? "▴" : "▾";
    };

    // Refresh entries
    panel.querySelector("#ppp_refresh").onclick = () => {
      renderEntries();
    };

    // Save current as new preset
    panel.querySelector("#ppp_save_new").onclick = () => {
      openSaveDialog(null);
    };

    // Save dialog
    panel.querySelector("#ppp_dialog_cancel").onclick = () => {
      panel.querySelector("#ppp_dialog").style.display = "none";
    };
    panel.querySelector("#ppp_dialog_ok").onclick = () => {
      commitSaveDialog();
    };
    panel.querySelector("#ppp_dialog_name").onkeydown = (e) => {
      if (e.key === "Enter") commitSaveDialog();
      if (e.key === "Escape") panel.querySelector("#ppp_dialog").style.display = "none";
    };

    // Dragging
    makeDraggable(panel, panel.querySelector("#ppp_drag_handle"));
  }

  // ── Render Presets ────────────────────────────────

  function renderPresets() {
    const list = document.getElementById("ppp_preset_list");
    if (!list) return;

    const presets = getPresets();
    if (presets.length === 0) {
      list.innerHTML = `<div class="ppp-empty-hint">No presets yet.<br>Click <b>＋ Save Current</b> to create one.</div>`;
      return;
    }

    list.innerHTML = "";
    presets.forEach((preset) => {
      const card = document.createElement("div");
      card.className = "ppp-preset-card";
      card.dataset.id = preset.id;

      const count = Object.keys(preset.snapshot).length;
      const on = Object.values(preset.snapshot).filter((v) => v.enabled).length;

      card.innerHTML = `
        <div class="ppp-preset-info">
          <div class="ppp-preset-name" title="${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</div>
          <div class="ppp-preset-meta">${on}/${count} enabled${preset.description ? " · " + escapeHtml(preset.description) : ""}</div>
          <div class="ppp-preset-chips" id="chips_${preset.id}"></div>
        </div>
        <div class="ppp-preset-actions">
          <button class="ppp-btn ppp-btn-apply" data-id="${preset.id}" title="Apply this preset">▶ Apply</button>
          <button class="ppp-btn ppp-btn-overwrite" data-id="${preset.id}" title="Overwrite with current state">↺</button>
          <button class="ppp-btn ppp-btn-rename" data-id="${preset.id}" title="Rename">✎</button>
          <button class="ppp-btn ppp-btn-delete" data-id="${preset.id}" title="Delete">🗑</button>
        </div>
      `;
      list.appendChild(card);

      // Render chips
      const chipsEl = card.querySelector(`#chips_${preset.id}`);
      Object.values(preset.snapshot).forEach((entry) => {
        const chip = document.createElement("span");
        chip.className = "ppp-chip " + (entry.enabled ? "ppp-chip-on" : "ppp-chip-off");
        chip.textContent = entry.name;
        chip.title = entry.enabled ? "ON" : "OFF";
        chipsEl.appendChild(chip);
      });

      // Events
      card.querySelector(".ppp-btn-apply").onclick = (e) => {
        e.stopPropagation();
        const n = applyPreset(preset.id);
        showToast(`Applied "${preset.name}" — ${n} toggle(s) fired`);
        setTimeout(renderEntries, 300);
      };

      card.querySelector(".ppp-btn-overwrite").onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Overwrite preset "${preset.name}" with current entry states?`)) {
          savePresetFromCurrent(preset.name, preset.description);
          renderPresets();
          showToast(`Overwritten "${preset.name}"`);
        }
      };

      card.querySelector(".ppp-btn-rename").onclick = (e) => {
        e.stopPropagation();
        openSaveDialog(preset);
      };

      card.querySelector(".ppp-btn-delete").onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete preset "${preset.name}"?`)) {
          deletePreset(preset.id);
          renderPresets();
          showToast(`Deleted "${preset.name}"`);
        }
      };
    });
  }

  // ── Render Live Entries ───────────────────────────

  function renderEntries() {
    const list = document.getElementById("ppp_entries_list");
    const countEl = document.getElementById("ppp_entry_count");
    if (!list) return;

    const entries = scanPromptEntries();
    if (entries.length === 0) {
      list.innerHTML = `<div class="ppp-empty-hint">No entries found.<br>Make sure Prompt Manager is visible.</div>`;
      if (countEl) countEl.textContent = "–";
      return;
    }

    const on = entries.filter((e) => e.enabled).length;
    if (countEl) countEl.textContent = `${on}/${entries.length} ON`;

    list.innerHTML = "";
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "ppp-entry-row" + (entry.enabled ? " ppp-entry-on" : " ppp-entry-off");
      row.dataset.identifier = entry.identifier;
      row.innerHTML = `
        <span class="ppp-entry-dot"></span>
        <span class="ppp-entry-label" title="${escapeHtml(entry.identifier)}">${escapeHtml(entry.name)}</span>
        <label class="ppp-toggle">
          <input type="checkbox" ${entry.enabled ? "checked" : ""} data-ident="${escapeHtml(entry.identifier)}" />
          <span class="ppp-toggle-track"><span class="ppp-toggle-thumb"></span></span>
        </label>
      `;
      list.appendChild(row);

      const cb = row.querySelector("input[type='checkbox']");
      cb.onchange = () => {
        setPromptEnabled(entry.identifier, cb.checked);
        row.classList.toggle("ppp-entry-on", cb.checked);
        row.classList.toggle("ppp-entry-off", !cb.checked);
        // Update count
        const all = list.querySelectorAll("input[type='checkbox']");
        const onCount = [...all].filter((c) => c.checked).length;
        if (countEl) countEl.textContent = `${onCount}/${all.length} ON`;
      };
    });
  }

  // ── Save Dialog ───────────────────────────────────

  let _dialogTarget = null; // preset to edit, or null for new

  function openSaveDialog(preset) {
    _dialogTarget = preset;
    const dialog = document.getElementById("ppp_dialog");
    const title = document.getElementById("ppp_dialog_title");
    const nameInput = document.getElementById("ppp_dialog_name");
    const descInput = document.getElementById("ppp_dialog_desc");

    if (preset) {
      title.textContent = "Rename Preset";
      nameInput.value = preset.name;
      descInput.value = preset.description || "";
    } else {
      title.textContent = "Save Preset";
      nameInput.value = "";
      descInput.value = "";
    }
    dialog.style.display = "flex";
    setTimeout(() => nameInput.focus(), 50);
  }

  function commitSaveDialog() {
    const nameInput = document.getElementById("ppp_dialog_name");
    const descInput = document.getElementById("ppp_dialog_desc");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add("ppp-input-error");
      setTimeout(() => nameInput.classList.remove("ppp-input-error"), 1000);
      return;
    }

    if (_dialogTarget) {
      // Rename existing
      renamePreset(_dialogTarget.id, name);
      _dialogTarget.description = descInput.value.trim();
      saveToStorage(state);
    } else {
      // Save new
      savePresetFromCurrent(name, descInput.value.trim());
    }

    document.getElementById("ppp_dialog").style.display = "none";
    renderPresets();
    showToast(`Preset "${name}" saved!`);
  }

  // ── Toast ─────────────────────────────────────────

  function showToast(msg) {
    let toast = document.getElementById("ppp_toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ppp_toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("ppp-toast-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("ppp-toast-show"), 2500);
  }

  // ── Draggable ─────────────────────────────────────

  function makeDraggable(el, handle) {
    let startX, startY, startLeft, startTop;

    // Restore saved position
    const savedPos = localStorage.getItem("PPP_pos");
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        el.style.left = left;
        el.style.top = top;
        el.style.right = "auto";
        el.style.bottom = "auto";
      } catch (_) {}
    }

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, Math.min(window.innerWidth - 100, startLeft + dx));
        const newTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + dy));
        el.style.left = newLeft + "px";
        el.style.top = newTop + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        localStorage.setItem(
          "PPP_pos",
          JSON.stringify({ left: el.style.left, top: el.style.top })
        );
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // ── Launcher Button ───────────────────────────────

  function injectLauncherButton() {
    // Try to insert into ST's top toolbar
    const targets = [
      "#leftSendForm",
      "#send_form",
      "#top-bar",
      "#extensionsMenu",
      ".flex-container.alignitemsCenter",
      "body",
    ];

    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (el) {
        const btn = document.createElement("div");
        btn.id = "ppp_launcher";
        btn.title = "Prompt Preset Panel";
        btn.innerHTML = `<i class="fa-solid fa-layer-group"></i><span> Presets</span>`;

        // For body fallback, place as floating button
        if (sel === "body") {
          btn.classList.add("ppp-float-launcher");
          document.body.appendChild(btn);
        } else {
          btn.classList.add("ppp-toolbar-btn");
          el.prepend(btn);
        }

        btn.onclick = () => {
          const panel = document.getElementById(PANEL_ID) || buildPanel();
          if (panel.style.display === "none" || !panel.style.display) {
            panel.style.display = "flex";
            renderPresets();
            renderEntries();
          } else {
            panel.style.display = "none";
          }
        };
        break;
      }
    }
  }

  // ── Utilities ─────────────────────────────────────

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Init ──────────────────────────────────────────

  function init() {
    log("Initializing…");

    // Build panel (hidden)
    const panel = buildPanel();
    panel.style.display = "none";

    // Inject launcher
    injectLauncherButton();

    // Listen for ST events if available
    if (window.eventSource && window.event_types) {
      const { CHAT_CHANGED, CHARACTER_EDITED, SETTINGS_UPDATED } = window.event_types;
      [CHAT_CHANGED, CHARACTER_EDITED, SETTINGS_UPDATED].forEach((ev) => {
        if (ev) {
          window.eventSource.on(ev, () => {
            setTimeout(renderEntries, 500);
          });
        }
      });
    }

    // Also watch for Prompt Manager opening via MutationObserver
    const observer = new MutationObserver(() => {
      const panel = document.getElementById(PANEL_ID);
      if (panel && panel.style.display !== "none") {
        renderEntries();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    log("Ready.");
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 500);
  }
})();
