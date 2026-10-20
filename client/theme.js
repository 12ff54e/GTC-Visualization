import {
    THEME_STORAGE_KEY,
    normalizeTheme,
    resolveTheme,
} from './shared/theme-preference.js';

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let preference = 'system';
try {
    preference = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
} catch {
    // Theme switching also works when browser storage is unavailable.
}

function applyTheme() {
    const root = document.documentElement;
    const theme = resolveTheme(preference, systemTheme.matches);
    const changed = root.dataset.theme !== theme;
    root.dataset.theme = theme;
    document.querySelectorAll('[data-theme-select]').forEach(select => {
        select.value = preference;
    });
    if (changed) {
        window.dispatchEvent(new Event('gtc-theme-change'));
    }
}

// This small bundle runs synchronously in <head>, before the page is painted.
applyTheme();
systemTheme.addEventListener('change', () => {
    if (preference === 'system') applyTheme();
});
window.addEventListener('storage', event => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
        preference = normalizeTheme(event.newValue);
        applyTheme();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-control]').forEach((host, index) => {
        const label = document.createElement('label');
        const select = document.createElement('select');
        select.id = `theme-select-${index}`;
        select.dataset.themeSelect = '';
        label.htmlFor = select.id;
        label.textContent = 'Theme';
        for (const [value, text] of [
            ['system', 'System'],
            ['light', 'Light'],
            ['dark', 'Dark'],
        ]) {
            select.add(new Option(text, value));
        }
        select.value = preference;
        select.addEventListener('change', () => {
            preference = normalizeTheme(select.value);
            try {
                localStorage.setItem(THEME_STORAGE_KEY, preference);
            } catch {
                // Keep the choice for this page even without persistent storage.
            }
            applyTheme();
        });
        host.append(label, select);
    });
});
