import { motion } from 'framer-motion';
import { LogoMark } from './Logo';
import InterpretationChips from './InterpretationChips';

// Pipeline steps in the order the engine reports them.
const STEPS = [
  { stage: 'intent', label: 'Understand' },
  { stage: 'planning', label: 'Plan' },
  { stage: 'selecting', label: 'Search' },
  { stage: 'optimizing', label: 'Optimize' },
  { stage: 'checking', label: 'Verify' },
  { stage: 'explaining', label: 'Explain' },
];

/**
 * The one place that shows a running build: the animated mark, the live status line (announced to
 * assistive tech), the stepper, and for a refine the request being worked on and how it was understood.
 *
 * @param {string} [request] - the refine message being worked on
 * @param {Array<{label: string, text: string}>|null} [interpretation]
 */
export default function BuildProgress({ stage, message, request = '', interpretation = null }) {
  const current = STEPS.findIndex((s) => s.stage === stage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="card p-4 sm:p-5 border-accent-line"
    >
      <div className="flex items-center gap-4">
        <LogoMark size={request ? 44 : 56} animated className="shrink-0" />
        <div className="min-w-0 flex-1">
          {request && (
            <p className="text-sm text-fg-2 truncate mb-0.5">
              <span className="text-fg-3">Refining </span>
              <q className="italic">{request}</q>
            </p>
          )}
          <p role="status" className="text-sm sm:text-base font-semibold text-fg truncate">{message}</p>
          {!request && (
            <p className="text-xs text-fg-3 mt-0.5">Comparing live prices and checking compatibility</p>
          )}
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-6 gap-1.5 list-none p-0 m-0" aria-hidden="true">
        {STEPS.map((step, i) => {
          const done = current > i;
          const active = current === i;
          return (
            <li key={step.stage} className="min-w-0">
              <span
                className={`block h-1.5 rounded-full transition-colors duration-300 ${
                  done ? 'bg-accent' : active ? 'bg-accent progress-pulse' : 'bg-line'
                }`}
              />
              <span
                className={`hidden sm:block mt-1.5 text-[11px] truncate ${
                  active ? 'text-fg font-semibold' : done ? 'text-fg-2' : 'text-fg-3'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <InterpretationChips items={interpretation} label="Understood as" live className="mt-3 pt-3 border-t border-line" />
    </motion.div>
  );
}
