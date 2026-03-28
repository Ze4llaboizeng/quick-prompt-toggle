/**
 * Quick Prompt Toggle — SillyTavern Extension
 * Floating panel to enable/disable Prompt Manager entries instantly
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXT_NAME = 'quick-prompt-toggle';

// ─── State ───────────────────────────────────────────────────────────────────
let isOpen = false;
let toastTimer = null;

// ─── Core: Read prompt list from DOM ─────────────────────────────────────────
/**
 * SillyTavern renders each prompt entry as a list item in #completion_prompt_manager_list
 * Each item has a toggle checkbox/button for enabled state.
 *
 * Returns array of:
 *   { id, name, icon, enabled, toggleEl, itemEl }
 */
function readPromptEntries() {
    const entries = [];

    // Primary: prompt_manager list items (Chat Completion mode)
    const listEl = document.querySelector(
        '#completion_prompt_manager_list, .prompt_manager_prompt_list, [id*="prompt_manager"] ol, [id*="prompt_manager"] ul'
    );

    if (listEl) {
        const items = listEl.querySelectorAll('li[id], li.prompt_manager_prompt');
        items.forEach((li) => {
            const entry = parsePromptItem(li);
            if (entry) entries.push(entry);
        });
    }

    // Fallback: scan any visible prompt list
    if (entries.length === 0) {
        const allLists = document.querySelectorAll('[class*="prompt_manager"] li, [id*="prompt_manager"] li');
        allLists.forEach((li) => {
            const entry = parsePromptItem(li);
            if (entry && !entries.find(e => e.id === entry.id)) {
                entries.push(entry);
            }
        });
    }

    return entries;
}

function parsePromptItem(li) {
    // Try to get name from various ST structures
    const nameEl = li.querySelector(
        '.prompt_manager_prompt_name, .name, [class*="name"], span[title]'
    );

    // Toggle: ST uses a checkbox or a toggle-style element
    const toggleEl = li.querySelector(
        'input[type="checkbox"], .prompt_manager_prompt_toggle, [class*="toggle"], [data-action="toggle"]'
    );

    if (!nameEl && !li.textContent.trim()) return null;

    const rawName = nameEl
        ? nameEl.textContent.trim()
        : li.textContent.trim().split('\n')[0].trim();

    if (!rawName || rawName.length === 0) return null;

    // Determine enabled state
    let enabled = false;
    if (toggleEl) {
        if (toggleEl.type === 'checkbox') {
            enabled = toggleEl.checked;
        } else {
            enabled = toggleEl.classList.contains('enabled') ||
                      toggleEl.classList.contains('active') ||
                      li.classList.contains('enabled') ||
                      li.dataset.enabled === 'true' ||
                      li.classList.contains('prompt_manager_prompt_on');
        }
    } else {
        enabled = li.classList.contains('enabled') ||
                  li.classList.contains('prompt_manager_prompt_on') ||
                  li.dataset.enabled === 'true';
    }

    // Extract icon (emoji or ST icon)
    const iconEl = li.querySelector('.prompt_manager_prompt_name .icon, .item_name .icon, .prompt-icon');
    let icon = iconEl ? iconEl.textContent.trim() : '';

    // Also check if name starts with emoji
    const emojiMatch = rawName.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
    if (!icon && emojiMatch) {
        icon = emojiMatch[1];
    }

    const cleanName = icon ? rawName.replace(icon, '').trim() : rawName;

    return {
        id: li.id || li.dataset.pmIdentifier || cleanName,
        name: cleanName,
        icon,
        enabled,
        toggleEl,
        itemEl: li,
    };
}

// ─── Toggle a prompt entry ────────────────────────────────────────────────────
function toggleEntry(entry) {
    const { toggleEl, itemEl } = entry;
    const newState = !entry.enabled;

    if (toggleEl) {
        if (toggleEl.type === 'checkbox') {
            toggleEl.checked = newState;
            toggleEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // Button-style toggle — simulate click
            toggleEl.click();
        }
    } else {
        // Try clicking the item itself or a toggle area
        const btn = itemEl.querySelector('[data-action="toggle"], button.toggle, .toggle-btn');
        if (btn) {
            btn.click();
        } else {
            itemEl.click();
        }
    }

    // Also fire jQuery for ST's event listeners
    if (window.jQuery) {
        if (toggleEl) {
            if (toggleEl.type === 'checkbox') {
                window.jQuery(toggleEl).prop('checked', newState).trigger('change');
            } else {
                window.jQuery(toggleEl).trigger('click');
            }
        }
    }

    entry.enabled = newState;
    return newState;
}

// ─── DOM Build ───────────────────────────────────────────────────────────────
function buildUI() {
    document.getElementById('qpt-trigger-btn')?.remove();
    document.getElementById('qpt-panel')?.remove();

    // Trigger button
    const btn = document.createElement('button');
    btn.id = 'qpt-trigger-btn';
    btn.title = 'Quick Prompt Toggle  (Alt+P)';
    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="16" height="2.5" rx="1.25" fill="currentColor" opacity="0.9"/>
          <rect x="2" y="8.75" width="16" height="2.5" rx="1.25" fill="currentColor" opacity="0.6"/>
          <rect x="2" y="13.5" width="10" height="2.5" rx="1.25" fill="currentColor" opacity="0.35"/>
          <circle cx="16.5" cy="14.75" r="2.5" fill="#4ade80"/>
        </svg>
        <span class="qpt-badge" id="qpt-badge"></span>
    `;
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'qpt-panel';
    panel.classList.add('qpt-hidden');
    panel.innerHTML = `
        <div class="qpt-header">
            <span class="qpt-header-title">Prompt Toggle</span>
            <span class="qpt-header-meta" id="qpt-header-meta">—</span>
        </div>
        <div class="qpt-actions">
            <button class="qpt-action-btn qpt-btn-all-on" id="qpt-all-on">Enable All</button>
            <button class="qpt-action-btn qpt-btn-all-off" id="qpt-all-off">Disable All</button>
            <button class="qpt-action-btn" id="qpt-reload">↻ Sync</button>
        </div>
        <div class="qpt-list" id="qpt-list"></div>
        <div class="qpt-footer">
            <span class="qpt-footer-stat" id="qpt-stat">—</span>
            <button class="qpt-reload-btn" id="qpt-open-manager">Open Manager ↗</button>
        </div>
    `;
    document.body.appendChild(panel);

    // Bindings
    document.getElementById('qpt-all-on').addEventListener('click', () => batchToggle(true));
    document.getElementById('qpt-all-off').addEventListener('click', () => batchToggle(false));
    document.getElementById('qpt-reload').addEventListener('click', () => renderList());
    document.getElementById('qpt-open-manager').addEventListener('click', openPromptManager);

    // Outside click close
    document.addEventListener('click', (e) => {
        if (isOpen && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            closePanel();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            togglePanel();
        }
        if (e.key === 'Escape' && isOpen) closePanel();
    });

    renderList();
}

// ─── Panel open/close ─────────────────────────────────────────────────────────
function togglePanel() {
    isOpen ? closePanel() : openPanel();
}

function openPanel() {
    isOpen = true;
    renderList();
    document.getElementById('qpt-panel')?.classList.remove('qpt-hidden');
    document.getElementById('qpt-trigger-btn')?.classList.add('qpt-open');
}

function closePanel() {
    isOpen = false;
    document.getElementById('qpt-panel')?.classList.add('qpt-hidden');
    document.getElementById('qpt-trigger-btn')?.classList.remove('qpt-open');
}

// ─── Render list ──────────────────────────────────────────────────────────────
function renderList() {
    const listEl = document.getElementById('qpt-list');
    const statEl = document.getElementById('qpt-stat');
    const metaEl = document.getElementById('qpt-header-meta');
    const badge  = document.getElementById('qpt-badge');

    if (!listEl) return;

    const entries = readPromptEntries();

    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="qpt-empty">
                <div class="qpt-empty-icon">📋</div>
                <div>No prompt entries found.<br><small>Open Prompt Manager to set up prompts.</small></div>
            </div>
        `;
        if (statEl) statEl.innerHTML = 'No entries';
        if (metaEl) metaEl.textContent = '—';
        badge.classList.remove('show');
        return;
    }

    const enabledCount = entries.filter(e => e.enabled).length;

    if (statEl) statEl.innerHTML = `<span>${enabledCount}</span> / ${entries.length} active`;
    if (metaEl) metaEl.textContent = `${entries.length} entries`;

    if (enabledCount > 0) {
        badge.textContent = enabledCount;
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }

    listEl.innerHTML = '';

    entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = `qpt-item${entry.enabled ? ' qpt-enabled' : ''}`;
        item.dataset.entryId = entry.id;

        const iconHtml = entry.icon
            ? `<span class="qpt-item-icon">${entry.icon}</span>`
            : `<span class="qpt-item-icon" style="color:var(--qpt-text-muted);font-size:10px;">◈</span>`;

        item.innerHTML = `
            ${iconHtml}
            <div class="qpt-item-info">
                <div class="qpt-item-name">${escapeHtml(entry.name)}</div>
            </div>
            <div class="qpt-toggle"></div>
        `;

        item.addEventListener('click', () => {
            const newState = toggleEntry(entry);
            item.classList.toggle('qpt-enabled', newState);

            // Update footer stats
            const allItems = listEl.querySelectorAll('.qpt-item');
            const activeCount = listEl.querySelectorAll('.qpt-item.qpt-enabled').length;
            if (statEl) statEl.innerHTML = `<span>${activeCount}</span> / ${allItems.length} active`;

            if (newState) {
                badge.textContent = activeCount;
                badge.classList.toggle('show', activeCount > 0);
            } else {
                const cnt = parseInt(badge.textContent || '0') - 1;
                badge.textContent = cnt;
                badge.classList.toggle('show', cnt > 0);
            }

            showToast(entry.name, newState);
        });

        listEl.appendChild(item);
    });
}

// ─── Batch toggle ─────────────────────────────────────────────────────────────
function batchToggle(state) {
    const entries = readPromptEntries();
    entries.forEach((entry) => {
        if (entry.enabled !== state) {
            toggleEntry(entry);
        }
    });
    setTimeout(renderList, 150);
    showToast(state ? 'All enabled' : 'All disabled', state);
}

// ─── Open native Prompt Manager ───────────────────────────────────────────────
function openPromptManager() {
    closePanel();

    // Try clicking the prompt manager button in ST nav
    const pmBtn = document.querySelector(
        '#completion_prompt_manager_open_ai_model_popup_button, [id*="prompt_manager"] button.open, [data-action="prompt-manager-open"]'
    );

    if (pmBtn) {
        pmBtn.click();
        return;
    }

    // Fallback: look for the icon in the connection panel
    const btns = document.querySelectorAll('button, .btn, [role="button"]');
    for (const b of btns) {
        const title = (b.title || b.getAttribute('data-i18n') || b.textContent || '').toLowerCase();
        if (title.includes('prompt') && (title.includes('manager') || title.includes('setting'))) {
            b.click();
            return;
        }
    }

    showToast('Open Prompt Manager manually', false);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(name, state) {
    document.querySelector('.qpt-toast')?.remove();
    clearTimeout(toastTimer);

    const toast = document.createElement('div');
    toast.className = `qpt-toast qpt-toast-${state ? 'on' : 'off'}`;
    toast.innerHTML = `
        <span class="qpt-toast-dot">${state ? '●' : '○'}</span>
        <span>${escapeHtml(name)}</span>
    `;
    document.body.appendChild(toast);

    toastTimer = setTimeout(() => {
        toast.classList.add('qpt-out');
        setTimeout(() => toast.remove(), 280);
    }, 1800);
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Observe DOM changes (detect when ST re-renders prompt list) ──────────────
function observePromptChanges() {
    const target = document.querySelector('#completion_prompt_manager_list') || document.body;

    const obs = new MutationObserver(() => {
        if (isOpen) renderList();
    });

    obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-enabled'] });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
jQuery(async () => {
    buildUI();
    setTimeout(observePromptChanges, 2000);
    console.log('[QuickPromptToggle] Loaded ✓  |  Alt+P to open');
});
