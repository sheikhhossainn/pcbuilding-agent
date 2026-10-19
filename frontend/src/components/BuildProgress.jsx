import { m, AnimatePresence } from 'framer-motion';
import { fadeIn, tween, ease, spring } from '../lib/motion';
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

// Rough time a stage takes, for the in-stage fill. It eases toward 90% and never claims done.
const STAGE_SECONDS = { intent: 3, planning: 2, selecting: 6, optimizing: 4, checking: 2, explaining: 4 };

function StepBar({ state, seconds }) {
  return (
    <span className="relative block h-1.5 rounded-full bg-line overflow-hidden">
      <m.span
        className="absolute inset-0 rounded-full bg-accent origin-left"
        initial={false}
        animate={{ scaleX: state === 'done' ? 1 : state === 'active' ? 0.9 : 0 }}
        transition={state === 'active'
          ? { duration: seconds, ease: [0.1, 0.6, 0.3, 1] }
          : spring.snappy}
      />
      {state === 'active' && <span className="absolute inset-0 progress-sheen" />}
    </span>
  );
}

// A finished step gets a check that draws itself in.
function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-accent" aria-hidden="true">
      <m.path
        d="M1.5 5.2 4 7.5 8.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: ease.out }}
      />
    </svg>
  );
}

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
    <m.div
      {...fadeIn(6)}
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
          {/* The status line cross-fades between stages instead of snapping. */}
          <p role="status" className="relative text-sm sm:text-base font-semibold text-fg h-6 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={message}
                className="block truncate"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: tween.exit }}
                transition={{ ...spring.smooth, opacity: tween.base }}
              >
                {message}
              </m.span>
            </AnimatePresence>
          </p>
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
              <StepBar state={done ? 'done' : active ? 'active' : 'todo'} seconds={STAGE_SECONDS[step.stage]} />
              <span
                className={`hidden sm:flex items-center gap-1 mt-1.5 text-[11px] min-w-0 transition-colors duration-300 ${
                  active ? 'text-fg font-semibold' : done ? 'text-fg-2' : 'text-fg-3'
                }`}
              >
                {done && <Check />}
                <span className="truncate">{step.label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <InterpretationChips items={interpretation} label="Understood as" live className="mt-3 pt-3 border-t border-line" />
    </m.div>
  );
}
