// Appearance: 'system' follows the OS (CSS media query), 'light'/'dark' pin it via html[data-theme].
// index.html applies a saved choice before first paint; this keeps it in sync afterwards.

export const THEMES = ['system', 'light', 'dark'];

const BAR_COLOR = { light: '#f5f5f7', dark: '#0b0c10' };

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  // Browser chrome colour: pinned themes override both media-specific tags.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') || '';
    const systemColor = media.includes('light') ? BAR_COLOR.light : BAR_COLOR.dark;
    meta.setAttribute('content', BAR_COLOR[theme] || systemColor);
  });
}
