/* GitHub-style light/dark appearance for Envelop pages. */
(function () {
  const KEY = 'envelop-theme';
  const LIGHT = 'light';
  const DARK = 'dark';

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }

  function storedTheme() {
    try {
      const value = localStorage.getItem(KEY);
      return value === LIGHT || value === DARK ? value : null;
    } catch (_) {
      return null;
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === DARK ? DARK : LIGHT;
  }

  function applyTheme(theme, persist) {
    const next = theme === DARK ? DARK : LIGHT;
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', next === DARK ? '#121513' : '#f7f5ef');
    }
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = next === DARK ? 'Switch to light appearance' : 'Switch to dark appearance';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', next === DARK ? 'true' : 'false');
    });
    if (persist) {
      try {
        localStorage.setItem(KEY, next);
      } catch (_) { /* ignore quota / private mode */ }
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === DARK ? LIGHT : DARK, true);
  }

  function boot() {
    applyTheme(storedTheme() || systemTheme(), false);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!storedTheme()) applyTheme(systemTheme(), false);
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
    else if (typeof media.addListener === 'function') media.addListener(onChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
