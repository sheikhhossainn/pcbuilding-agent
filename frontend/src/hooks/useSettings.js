import { useState, useEffect } from 'react';
import { setFeedbackPrefs } from '../lib/feedback';

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const readFlag = (key, fallback) => {
  const value = read(key, '');
  return value === '' ? fallback : value === '1';
};

// AI provider + the user's own API keys. Keys never leave the browser except
// in the build request payload, same as before the refactor.
// Sound and haptics are on by default; nothing plays before the first click.
export function useSettings() {
  const [groqKey, setGroqKey] = useState(() => read('customGroqKey', ''));
  const [ollamaKey, setOllamaKey] = useState(() => read('customOllamaKey', ''));
  const [provider, setProvider] = useState(() => read('aiProvider', 'ollama'));
  const [sound, setSound] = useState(() => readFlag('soundEnabled', true));
  const [haptics, setHaptics] = useState(() => readFlag('hapticsEnabled', true));

  useEffect(() => {
    try {
      localStorage.setItem('customGroqKey', groqKey);
      localStorage.setItem('customOllamaKey', ollamaKey);
      localStorage.setItem('aiProvider', provider);
      localStorage.setItem('soundEnabled', sound ? '1' : '0');
      localStorage.setItem('hapticsEnabled', haptics ? '1' : '0');
    } catch {
      // storage unavailable — settings just won't persist
    }
  }, [groqKey, ollamaKey, provider, sound, haptics]);

  useEffect(() => {
    setFeedbackPrefs({ sound, haptics });
  }, [sound, haptics]);

  return {
    groqKey, setGroqKey, ollamaKey, setOllamaKey, provider, setProvider,
    sound, setSound, haptics, setHaptics,
  };
}
