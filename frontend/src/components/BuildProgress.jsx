import { motion } from 'framer-motion';
import { LogoMark } from './Logo';

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
 * Shown while a build is running: the animated mark "scans" the market while the
 * stepper shows which pipeline stage is active. Purely visual; the Composer pill
 * carries the status announcement for assistive tech.
 */
export default function BuildProgress({ stage, message }) {
  const current = STEPS.findIndex((s) => s.stage === stage);

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="card p-4 sm:p-5 flex items-center gap-4"
    >
      <LogoMark size={56} animated className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm sm:text-base font-semibold text-fg truncate">{message}</p>
        <p className="text-xs text-fg-3 mt-0.5">Comparing live prices and checking compatibility</p>
        <ol className="mt-3 grid grid-cols-6 gap-1.5 list-none p-0 m-0">
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
                    active ? 'text-fg font-semibold' : 'text-fg-3'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </motion.div>
  );
}
