import { useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'buildmypc.theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Light is the default. An inline script in index.html applies the saved
// theme before first paint; this hook keeps React state in sync with it.
export function useTheme() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // ignore — theme just won't persist
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
