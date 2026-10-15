import { motion } from 'framer-motion';
import { Box, ExternalLink, Trash2 } from 'lucide-react';
import { CATEGORY_ICONS } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { getSpecChips } from '../lib/telemetry';
import RowMenu from './RowMenu';

export function SkeletonRow() {
  return (
    <div className="card px-4 py-3 flex items-center gap-3 animate-pulse min-h-16" aria-hidden="true">
      <div className="w-10 h-10 bg-surface-2 rounded-lg shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <div className="w-20 h-3 bg-surface-2 rounded" />
        <div className="w-3/4 sm:w-64 h-4 bg-surface-2 rounded" />
      </div>
      <div className="w-16 h-5 bg-surface-2 rounded" />
    </div>
  );
}

const rowMotion = (index) => ({
  layout: true,
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: Math.min(index, 8) * 0.03 },
});

/**
 * One line per part (two on phones). Empty optional rows are dashed and quiet;
 * empty required rows say so.
 */
export default function PartRow({ category, item, isRequired, dependency, isCore, index = 0, onRemove }) {
  const Icon = CATEGORY_ICONS[category] || Box;

  if (!item) {
    return (
      <motion.div
        {...rowMotion(index)}
        className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 sm:px-4 py-2 min-h-14"
      >
        <div className="w-9 h-9 rounded-lg bg-surface-2 text-fg-3 flex items-center justify-center shrink-0" aria-hidden="true">
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-fg-2">{category}</span>
          {isRequired && (
            <span className="text-xs font-medium bg-bad-soft text-bad px-2 py-0.5 rounded border border-bad-line">
              Required
            </span>
          )}
          {dependency && <span className="text-xs text-fg-3">Must match {dependency}</span>}
        </div>
        <span className="text-sm text-fg-3 shrink-0">Not selected</span>
      </motion.div>
    );
  }

  const chips = getSpecChips(category, item.name);

  return (
    <motion.div
      {...rowMotion(index)}
      className="card px-3 sm:px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3"
    >
      {item.image ? (
        <img
          src={item.image}
          alt=""
          className="w-10 h-10 object-contain rounded-lg bg-white p-0.5 border border-line shrink-0"
        />
      ) : (
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isCore ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2'
          }`}
          aria-hidden="true"
        >
          <Icon size={20} strokeWidth={1.5} />
        </div>
      )}

      <div className="min-w-0">
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <span className="text-xs font-medium text-fg-3">{category}</span>
          <span className="num text-sm font-semibold text-fg sm:hidden">{formatPrice(item.price)}</span>
          {chips.length > 0 && (
            <span className="hidden sm:flex items-center gap-1.5">
              {chips.map((chip) => (
                <span key={chip} className="spec-tag">{chip}</span>
              ))}
            </span>
          )}
        </div>
        <div className="text-sm sm:text-[15px] font-medium text-fg leading-snug line-clamp-2 sm:truncate" title={item.name}>
          {item.name}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 sm:hidden">
            {chips.slice(0, 2).map((chip) => (
              <span key={chip} className="spec-tag">{chip}</span>
            ))}
          </div>
        )}
      </div>

      <div className="hidden sm:block num font-semibold text-lg text-fg whitespace-nowrap text-right min-w-24">
        {formatPrice(item.price)}
      </div>

      <div className="hidden sm:flex items-center gap-1.5">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-icon-sm"
            title="View on retailer site"
            aria-label={`View ${category} on retailer site`}
          >
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          onClick={() => onRemove(category)}
          className="btn btn-icon-sm hover:text-bad hover:border-bad-line"
          title="Remove part"
          aria-label={`Remove ${category}`}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <RowMenu category={category} url={item.url} onRemove={onRemove} />
    </motion.div>
  );
}
