import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { formatPrice } from '../../lib/format';
import { formatDelta, deltaTone } from '../../lib/buildDiff';

// Newest few are what people go back to; the rest sit behind "Show all".
const COLLAPSED_COUNT = 3;

/**
 * Every build and refine in this session, newest first, labelled with what the user asked for.
 * Restoring one keeps the others, so it can be undone by restoring again.
 */
export default function VersionsCard({ versions, currentVersionId, onRestore, disabled = false }) {
  const [showAll, setShowAll] = useState(false);
  if (!versions || versions.length < 2) return null;

  const rows = versions.map((v, i) => ({
    ...v,
    number: i + 1,
    delta: i === 0 ? null : v.total - versions[i - 1].total,
  })).reverse();
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-label="Versions" className="card p-5 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <History size={14} className="text-fg-3" aria-hidden="true" /> Versions
        </h3>
        <span className="text-xs text-fg-3 num">{versions.length}</span>
      </div>

      <ol className="relative space-y-1 list-none p-0 m-0">
        {visible.map((v) => {
          const current = v.id === currentVersionId;
          return (
            <li
              key={v.id}
              className={`group relative flex items-start gap-3 rounded-lg px-2.5 py-2 -mx-2.5 ${current ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
            >
              <span
                className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border text-[11px] font-semibold num flex items-center justify-center ${
                  current ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-fg-3 border-line'
                }`}
                aria-hidden="true"
              >
                {v.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg line-clamp-2" title={v.label}>{v.label}</p>
                <p className="text-xs text-fg-3 num mt-0.5">
                  {formatPrice(v.total)}
                  {v.delta !== null && v.delta !== 0 && (
                    <span className={`ml-1.5 ${deltaTone(v.delta)}`}>{formatDelta(v.delta)}</span>
                  )}
                </p>
              </div>
              {current ? (
                <span className="text-xs font-medium text-accent mt-1 shrink-0">Current</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRestore(v.id)}
                  disabled={disabled}
                  className="btn min-h-8 px-2 text-xs shrink-0"
                  aria-label={`Restore version ${v.number}: ${v.label}`}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {rows.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 text-xs font-medium text-fg-3 hover:text-fg min-h-8"
        >
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
