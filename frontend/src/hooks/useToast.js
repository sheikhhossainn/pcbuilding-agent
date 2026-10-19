import { useState, useRef, useEffect, useCallback } from 'react';

export const MAX_TOASTS = 3;
const DURATION_MS = 2800;
const DURATION_WITH_ACTION_MS = 6000;

const ERROR_TEXT = /^(couldn'?t|could not|unable|failed|can'?t|cannot)(?![a-z])/i;

/**
 * A short stack of toasts, newest first (like macOS notifications). Each one times out on its own.
 * Showing a message that is already up restarts it instead of stacking a copy ("Link copied" twice).
 *
 * toasts: Array<{ id, message, tone, duration, action?: { label, onClick } }>
 * tone: 'success' | 'info' | 'error'. Pass it as `{ tone }` in the third argument; when left out,
 * messages that say something failed ("Couldn't ...", "Unable to ...") are shown as errors.
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  // Set while a toast's own action runs, so `dismissToast()` inside it closes that toast.
  const actingRef = useRef(null);
  const nextId = useRef(1);

  const remove = useCallback((id) => {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Close one toast; without an id, the one whose action is running, else the newest. */
  const dismissToast = useCallback((id) => {
    if (id !== undefined) return remove(id);
    if (actingRef.current !== null) return remove(actingRef.current);
    setToasts((prev) => {
      if (prev.length === 0) return prev;
      clearTimeout(timersRef.current.get(prev[0].id));
      timersRef.current.delete(prev[0].id);
      return prev.slice(1);
    });
    return undefined;
  }, [remove]);

  const showToast = useCallback((message, action = null, options = {}) => {
    const id = nextId.current++;
    const tone = options.tone || (ERROR_TEXT.test(message) ? 'error' : 'success');
    const duration = action ? DURATION_WITH_ACTION_MS : DURATION_MS;
    const wrapped = action ? {
      label: action.label,
      onClick: () => {
        actingRef.current = id;
        try {
          action.onClick();
        } finally {
          actingRef.current = null;
        }
        remove(id);
      },
    } : null;

    setToasts((prev) => {
      const same = prev.find((t) => t.message === message);
      if (same) {
        clearTimeout(timersRef.current.get(same.id));
        timersRef.current.delete(same.id);
      }
      const rest = prev.filter((t) => t.message !== message);
      const next = [{ id, message, tone, duration, action: wrapped }, ...rest];
      // Oldest beyond the cap leave at once.
      next.slice(MAX_TOASTS).forEach((t) => {
        clearTimeout(timersRef.current.get(t.id));
        timersRef.current.delete(t.id);
      });
      return next.slice(0, MAX_TOASTS);
    });
    timersRef.current.set(id, setTimeout(() => remove(id), duration));
    return id;
  }, [remove]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, showToast, dismissToast };
}
