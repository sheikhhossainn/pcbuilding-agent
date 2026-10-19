import { m, AnimatePresence } from 'framer-motion';
import { fadeIn, spring } from '../lib/motion';
import { CheckCircle2 } from 'lucide-react';

export default function Toast({ toast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-36 lg:top-24 inset-x-0 flex justify-center px-4 z-50 pointer-events-none print:hidden"
    >
      <AnimatePresence>
        {toast && (
          <m.div
            key={toast.message}
            {...fadeIn(-12, spring.snappy)}
          >
            <div className={`surface-float pointer-events-auto flex items-center gap-2.5 rounded-full bg-fg text-bg pl-4 text-sm ${toast.action ? 'pr-1 py-1' : 'pr-5 py-2.5'}`}>
              <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="ml-1 min-h-11 px-4 rounded-full bg-bg/15 hover:bg-bg/25 font-semibold text-sm transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
