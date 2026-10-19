import { useDragControls } from 'framer-motion';

/**
 * Drag-to-dismiss for bottom sheets on phones. Only the grab handle (and header) start a drag, so
 * scrolling the sheet's content still scrolls. A pull past ~110px or a quick flick closes it;
 * anything less springs back. Pulling up rubber-bands without moving the sheet away.
 *
 * @param {boolean} enabled - true when the dialog is shown as a bottom sheet
 * @param {() => void} onClose
 * @returns {{ sheetProps: object, handleProps: object }} spread onto the m.* sheet and its handle
 */
export function useSheetDrag(enabled, onClose) {
  const controls = useDragControls();
  if (!enabled) return { sheetProps: {}, handleProps: {} };
  return {
    sheetProps: {
      drag: 'y',
      dragControls: controls,
      dragListener: false,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0.04, bottom: 0.75 },
      onDragEnd: (_, info) => {
        if (info.offset.y > 110 || info.velocity.y > 600) onClose();
      },
    },
    handleProps: {
      onPointerDown: (e) => controls.start(e),
      style: { touchAction: 'none' },
    },
  };
}
