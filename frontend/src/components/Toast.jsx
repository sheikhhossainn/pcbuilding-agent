import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { spring, tween } from '../lib/motion';

const PEEK = 10; // px each older toast peeks out below the one in front
const GAP = 56; // px between toasts when the stack is spread out

/**
 * Toasts stacked like macOS notifications: the newest in front, older ones tucked behind it.
 * Hovering or tabbing into the stack spreads it out so an older "Undo" stays reachable.
 * Swipe a toast sideways to dismiss it.
 */
export default function Toast({ toasts, onDismiss }) {
  const [spread, setSpread] = useState(false);
  const expanded = spread && toasts.length > 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-36 lg:top-24 inset-x-0 flex justify-center px-4 z-50 pointer-events-none print:hidden"
    >
      <div
        className="relative w-full max-w-md h-12"
        onMouseEnter={() => setSpread(true)}
        onMouseLeave={() => setSpread(false)}
        onFocus={() => setSpread(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSpread(false); }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast, index) => {
            const hidden = !expanded && index > 0;
            return (
              <m.div
                key={toast.id}
                // Spread out, each slot also covers the gap below it, so moving between toasts keeps the stack open.
                className={`absolute inset-x-0 top-0 flex justify-center ${expanded ? 'pointer-events-auto pb-3' : ''}`}
                style={{ zIndex: toasts.length - index }}
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{
                  opacity: expanded ? 1 : [1, 0.7, 0.4][index] ?? 0,
                  y: expanded ? index * GAP : index * PEEK,
                  scale: expanded ? 1 : 1 - index * 0.05,
                }}
                exit={{ opacity: 0, scale: 0.92, transition: tween.exit }}
                transition={{ ...spring.snappy, opacity: tween.fast }}
              >
                <m.div
                  drag="x"
                  dragSnapToOrigin
                  dragElastic={0.6}
                  onDragEnd={(_, info) => {
                    if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) onDismiss(toast.id);
                  }}
                  aria-hidden={hidden || undefined}
                  className={`surface-float flex items-center gap-2.5 rounded-full bg-fg text-bg pl-4 text-sm cursor-grab active:cursor-grabbing touch-pan-y ${
                    toast.action ? 'pr-1 py-1' : 'pr-5 py-2.5'
                  } ${hidden ? '' : 'pointer-events-auto'}`}
                >
                  <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                  <span>{toast.message}</span>
                  {toast.action && (
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      tabIndex={hidden ? -1 : undefined}
                      className="ml-1 min-h-11 px-4 rounded-full bg-bg/15 hover:bg-bg/25 font-semibold text-sm transition-colors"
                    >
                      {toast.action.label}
                    </button>
                  )}
                </m.div>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
