# Prompt Set Manager — SillyTavern Extension

> Save and restore named presets of Prompt Manager enabled/disabled states —
> exactly like Regex Presets, but for your prompts.

---

## Installation

1. Copy the **`st-prompt-set-manager`** folder into:
   ```
   SillyTavern/public/scripts/extensions/third-party/st-prompt-set-manager/
   ```
2. Restart SillyTavern (or reload the page).
3. Open **Extensions** (🧩 puzzle-piece icon) → scroll down to find **Prompt Set Manager**.

---

## Usage

| Action | How |
|--------|-----|
| **Save current state** | Click **Save Current**, enter a name → saves which prompts are ON/OFF right now |
| **Apply a set** | Click ▶ (play) on any saved set → instantly enables/disables prompts as saved |
| **Rename a set** | Click ✏ (pencil) |
| **Overwrite a set** | Click 🔃 (arrows) → replaces the set with the current prompt state |
| **Reorder sets** | Click ↑ / ↓ chevrons |
| **Delete a set** | Click 🗑 (trash) |

### Hotkey (optional)
Type a shortcut in the **Quick-access hotkey** box, e.g. `Alt+Shift+P`.  
This toggles the extension drawer open/closed so you can apply sets without clicking through menus.

---

## How it Works

- Reads `oai_settings.prompts` (the standard OpenAI-compatible Prompt Manager array).
- Saves `{ identifier: enabled }` maps per set in `extension_settings` (auto-persisted by ST).
- On apply: writes back to `oai_settings.prompts` **and** syncs the live DOM, so the Prompt Manager UI updates instantly if it's open.
- Falls back to DOM-only mode if `oai_settings` is not available (non-OAI APIs).

---

## Compatibility

- SillyTavern `1.10+` with OpenAI-compatible API (Claude, OpenAI, OpenRouter, etc.)
- Requires the **Prompt Manager** feature to be in use
- No external dependencies

---

## Notes

- Sets only store **enabled/disabled** states, not prompt content.
- Prompts not present in a saved set are left unchanged when applying.
- Data is stored in ST's `settings.json` under `extension_settings.prompt_set_manager`.
