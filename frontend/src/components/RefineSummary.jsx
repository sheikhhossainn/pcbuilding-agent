import { motion } from 'framer-motion';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { formatDelta } from '../lib/buildDiff';
import InterpretationChips from './InterpretationChips';

const partLabel = (part) => (part ? part.name : 'none');

/**
 * What the last refine did: the parts it changed with their price difference, how many it left
 * alone, and a way to put the whole build back.
 */
export default function RefineSummary({ refine, onUndo, onDismiss }) {
  const { changed, kept, totalDelta } = refine;
  const nothingChanged = changed.length === 0;

  return (
    <motion.section
      aria-label="What changed"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="card px-3 sm:px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-fg">
          {nothingChanged
            ? (refine.interpretation?.length ? 'Nothing could be changed within your budget' : 'No parts needed to change')
            : `Changed ${changed.length} ${changed.length === 1 ? 'part' : 'parts'}`}
          <span className="font-normal text-fg-3">
            {' '}· kept {kept.length} as {kept.length === 1 ? 'it was' : 'they were'}
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
          {!nothingChanged && (
            <button type="button" onClick={onUndo} className="btn">
              <RotateCcw size={14} aria-hidden="true" />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="btn btn-icon-sm"
            aria-label="Dismiss summary"
            title="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <InterpretationChips items={refine.interpretation} label="You asked for" className="mt-2" />

      {!nothingChanged && (
        <ul className="mt-2 space-y-1.5">
          {changed.map(({ category, before, after, delta }) => (
            <li key={category} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-fg w-28 shrink-0">{category}</span>
              <span className="min-w-0 flex-1 text-fg-2 flex flex-wrap items-baseline gap-x-1.5">
                <span className="truncate max-w-full" title={partLabel(before)}>{partLabel(before)}</span>
                <ArrowRight size={12} aria-hidden="true" className="text-fg-3 shrink-0 self-center" />
                <span className="truncate max-w-full text-fg" title={partLabel(after)}>{partLabel(after)}</span>
              </span>
              <span className={`num font-semibold shrink-0 ${delta > 0 ? 'text-fg' : 'text-ok'}`}>
                {formatDelta(delta)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!nothingChanged && (
        <p className="mt-2 pt-2 border-t border-line text-xs text-fg-3">
          Net change <span className="num font-semibold text-fg-2">{formatDelta(totalDelta)}</span>
        </p>
      )}
    </motion.section>
  );
}
