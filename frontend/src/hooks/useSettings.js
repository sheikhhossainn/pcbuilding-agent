import { useState, useEffect } from 'react';

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

// AI provider + the user's own API keys. Keys never leave the browser except
// in the build request payload, same as before the refactor.
export function useSettings() {
  const [groqKey, setGroqKey] = useState(() => read('customGroqKey', ''));
  const [ollamaKey, setOllamaKey] = useState(() => read('customOllamaKey', ''));
  const [provider, setProvider] = useState(() => read('aiProvider', 'ollama'));

  useEffect(() => {
    try {
      localStorage.setItem('customGroqKey', groqKey);
      localStorage.setItem('customOllamaKey', ollamaKey);
      localStorage.setItem('aiProvider', provider);
    } catch {
      // storage unavailable — settings just won't persist
    }
  }, [groqKey, ollamaKey, provider]);

  return { groqKey, setGroqKey, ollamaKey, setOllamaKey, provider, setProvider };
}
