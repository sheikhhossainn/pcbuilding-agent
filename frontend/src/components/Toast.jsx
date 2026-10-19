import { useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, AlertCircle, Info, X } from 'lucide-react';
import { spring, tween } from '../lib/motion';

const PEEK = 10; // px each older toast peeks out below the one in front
const GAP = 68; // px between toasts when the stack is spread out

const TONES = {
  success: { Icon: Check, chip: 'bg-ok-soft text-ok border-ok-line', bar: 'bg-ok' },
  info: { Icon: Info, chip: 'bg-accent-soft text-accent border-accent-line', bar: 'bg-accent' },
  error: { Icon: AlertCircle, chip: 'bg-bad-soft text-bad border-bad-line', bar: 'bg-bad' },
};

/**
 * Toasts stacked like macOS notifications: a translucent card with a tone icon, the message, an
 * optional action, and a thin bar that runs down with the time left. The newest is in front and
 * older ones tuck behind it; hovering or tabbing into the stack spreads it so an older "Undo"
 * stays reachable. Swipe a toast sideways to dismiss it, or use its close button.
 */
export default function Toast({ toasts, onDismiss }) {
  const [spread, setSpread] = useState(false);
  const reduceMotion = useReducedMotion();
  const expanded = spread && toasts.length > 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-36 lg:top-24 inset-x-0 flex justify-center px-4 z-50 pointer-events-none print:hidden"
    >
      <div
        className="relative w-full max-w-md h-14"
        onMouseEnter={() => setSpread(true)}
        onMouseLeave={() => setSpread(false)}
        onFocus={() => setSpread(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSpread(false); }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast, index) => {
            const hidden = !expanded && index > 0;
            const { Icon, chip, bar } = TONES[toast.tone] || TONES.success;
            return (
              <m.div
                key={toast.id}
                // Spread out, each slot also covers the gap below it, so moving between toasts keeps the stack open.
                className={`absolute inset-x-0 top-0 flex justify-center ${expanded ? 'pointer-events-auto pb-3' : ''}`}
                style={{ zIndex: toasts.length - index }}
                initial={{ opacity: 0, y: -18, scale: 0.95 }}
                animate={{
                  opacity: expanded ? 1 : [1, 0.75, 0.45][index] ?? 0,
                  y: expanded ? index * GAP : index * PEEK,
                  scale: expanded ? 1 : 1 - index * 0.05,
                }}
                exit={{ opacity: 0, scale: 0.94, transition: tween.exit }}
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
                  className={`material relative overflow-hidden flex items-center gap-3 min-h-[3.25rem] max-w-full rounded-2xl border border-line-strong pl-2.5 text-sm text-fg cursor-grab active:cursor-grabbing touch-pan-y select-none ${
                    toast.action ? 'pr-1.5' : 'pr-2'
                  } ${hidden ? '' : 'pointer-events-auto'}`}
                >
                  <span
                    className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center ${chip}`}
                    aria-hidden="true"
                  >
                    <Icon size={16} strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 py-2 font-medium leading-snug">{toast.message}</span>
                  {toast.action && (
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      tabIndex={hidden ? -1 : undefined}
                      className="ml-1 shrink-0 min-h-10 px-3.5 rounded-xl bg-accent-soft text-accent border border-accent-line font-semibold hover:bg-accent hover:text-accent-fg transition-colors"
                    >
                      {toast.action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    tabIndex={hidden ? -1 : undefined}
                    aria-label="Dismiss"
                    className="shrink-0 w-8 h-8 mr-0.5 rounded-full flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>

                  {/* Time left. Only the newest runs visibly; with reduced motion it stays out. */}
                  {!reduceMotion && (
                    <m.span
                      aria-hidden="true"
                      className={`absolute left-0 bottom-0 h-[2px] w-full origin-left opacity-70 ${bar}`}
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: 0 }}
                      transition={{ duration: toast.duration / 1000, ease: 'linear' }}
                    />
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
