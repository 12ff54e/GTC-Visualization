export const THEME_STORAGE_KEY = 'gtc-visualization-theme';

export function normalizeTheme(value) {
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
}

export function resolveTheme(preference, systemDark) {
    const choice = normalizeTheme(preference);
    return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}
