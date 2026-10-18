import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';
import { formatDelta, deltaTone } from '../lib/buildDiff';
import { formatPrice } from '../lib/format';
import InterpretationChips from './InterpretationChips';

const partLabel = (part) => (part ? part.name : 'Removed');

function BudgetImpact({ total, budget }) {
  if (!(budget > 0)) return null;
  const left = budget - total;
  return left >= 0 ? (
    <span className="chip bg-ok-soft border-ok-line text-ok num">{formatPrice(left)} under budget</span>
  ) : (
    <span className="chip bg-bad-soft border-bad-line text-bad num">{formatPrice(-left)} over budget</span>
  );
}

/**
 * What the last refine did, kept short: a headline with the money and the budget, what the user asked
 * for, and the changed parts as links to their rows (the rows show the before/after). The full list is
 * one click away.
 */
export default function RefineSummary({
  refine, total, budget, onUndo, onDismiss, onFocusPart, onFixBudget,
}) {
  const { changed, kept, totalDelta, message } = refine;
  const nothingChanged = changed.length === 0;
  const [open, setOpen] = useState(false);
  const overBudget = budget > 0 && total > budget;

  let headline;
  if (nothingChanged) {
    headline = refine.interpretation?.length ? 'Nothing could change within your budget' : 'No parts needed to change';
  } else {
    headline = `Changed ${changed.length} ${changed.length === 1 ? 'part' : 'parts'}`;
  }

  return (
    <motion.section
      aria-label="What changed"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="card overflow-hidden"
    >
      <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-accent-soft text-accent border border-accent-line flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[15px] font-semibold text-fg">{headline}</h2>
            {!nothingChanged && (
              <span className={`num text-sm font-semibold ${deltaTone(totalDelta)}`}>{formatDelta(totalDelta)}</span>
            )}
            <BudgetImpact total={total} budget={budget} />
          </div>
          {message && (
            <p className="mt-0.5 text-sm text-fg-2 line-clamp-2">
              <span className="text-fg-3">You said </span>
              <q className="italic">{message}</q>
              {kept.length > 0 && (
                <span className="text-fg-3"> · kept {kept.length} {kept.length === 1 ? 'part' : 'parts'} as {kept.length === 1 ? 'it was' : 'they were'}</span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1.5 -mt-1 w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-fg-3 hover:text-fg hover:bg-surface-2"
          aria-label="Dismiss summary"
          title="Dismiss"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <InterpretationChips items={refine.interpretation} label="Understood as" className="px-4 pb-3 sm:pl-[3.75rem]" />

      {!nothingChanged && (
        <div className="px-4 pb-3 pl-4 sm:pl-[3.75rem] flex flex-wrap gap-1.5" role="list" aria-label="Changed parts">
          {changed.map(({ category, after, delta }) => (
            <button
              key={category}
              type="button"
              role="listitem"
              onClick={() => onFocusPart?.(category)}
              title={`Show ${category}`}
              className="chip min-h-8 px-2.5 cursor-pointer hover:border-line-strong hover:text-fg"
            >
              <span className="text-fg font-medium">{category}</span>
              {after ? (
                <span className={`num ${deltaTone(delta)}`}>{formatDelta(delta)}</span>
              ) : (
                <span className="text-fg-3">removed</span>
              )}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && !nothingChanged && (
          <motion.ul
            id="refine-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="border-t border-line bg-bg/40 divide-y divide-line overflow-hidden"
          >
            {changed.map(({ category, before, after, delta }) => (
              <li key={category} className="px-4 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg-3">{category}</p>
                  <p className="text-fg-3 truncate line-through decoration-fg-3/50" title={partLabel(before)}>{partLabel(before)}</p>
                  <p className="text-fg truncate flex items-center gap-1.5" title={partLabel(after)}>
                    <ArrowRight size={12} aria-hidden="true" className="text-accent shrink-0" />
                    <span className="truncate">{partLabel(after)}</span>
                  </p>
                </div>
                <span className={`num font-semibold self-center ${deltaTone(delta)}`}>{formatDelta(delta)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="px-3 py-2 border-t border-line flex items-center gap-1.5">
        {!nothingChanged && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="refine-details"
            className="btn border-transparent bg-transparent"
          >
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            {open ? 'Hide' : <><span className="sm:hidden">Details</span><span className="hidden sm:inline">Before and after</span></>}
          </button>
        )}
        <span className="flex-1" />
        {overBudget && onFixBudget && (
          <button type="button" onClick={onFixBudget} className="btn">
            Make it cheaper
          </button>
        )}
        {!nothingChanged && (
          <button type="button" onClick={onUndo} className="btn">
            <RotateCcw size={14} aria-hidden="true" />
            Undo
          </button>
        )}
      </div>
    </motion.section>
  );
}
