import { useRef, useEffect } from 'react';

// Closes a popover on outside pointer-down or Escape while it is open.
export function useDismiss(containerRef, open, onClose) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onCloseRef.current();
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, containerRef]);
}
