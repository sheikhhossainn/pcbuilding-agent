import { useRef, useEffect } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling: focus moves into the dialog, Tab stays inside, Esc closes,
 * and focus returns to whatever opened it. Attach the returned ref to the dialog
 * element (give it tabIndex={-1}).
 */
export function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep the latest onClose without re-running the focus effect on every render.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = dialog.querySelectorAll(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open]);

  return dialogRef;
}
