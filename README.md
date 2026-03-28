# ⚡ Prompt Preset Panel — SillyTavern Extension

Quick-access panel for toggling Prompt Manager entries in named presets.

## Features
- 💾 **Save named presets** — snapshot which entries are ON/OFF with a name & description  
- ▶ **One-click apply** — instantly toggle all entries to match a preset  
- ↺ **Overwrite preset** — update a preset with current entry states  
- ✎ **Rename** presets at any time  
- 🗑 **Delete** presets you no longer need  
- 🔴/🟢 **Live entry panel** — see and toggle individual entries directly in the panel  
- 🧲 **Draggable** floating panel — position it anywhere  
- 📱 **Responsive** — works on mobile too

## Installation

1. Copy the `prompt-preset-panel` folder into:
   ```
   SillyTavern/public/scripts/extensions/third-party/prompt-preset-panel/
   ```

2. In SillyTavern, go to **Extensions** → **Manage Extensions** and enable **Prompt Preset Panel**.

3. Reload the page — a **⚡ Presets** button will appear in the UI (or as a floating button if the toolbar slot isn't found).

## Usage

1. **Open your Prompt Manager** so entries are visible in the DOM.
2. **Click ⚡ Presets** to open the panel.
3. **Click ↺ Refresh** (top-right of panel header) to scan current prompt entries.
4. **Click ＋ Save Current** → enter a name → **Save**.
5. Use **▶ Apply** on any preset to switch all entries to that preset's state.
6. The **right column** shows live entries with individual toggles.

## Compatibility
Works with SillyTavern ≥ 1.10.  
Uses DOM-based scanning — compatible with OpenAI, Claude, and other backends that use the Prompt Manager.

## Notes
- Presets are saved in `localStorage` (persist across reloads).  
- Toggling entries in the panel fires actual clicks on the Prompt Manager checkboxes.  
- If entries aren't detected, make sure the Prompt Manager popup is open before clicking Refresh.
