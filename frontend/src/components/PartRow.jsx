import { motion } from 'framer-motion';
import { Box, ExternalLink, Trash2 } from 'lucide-react';
import { CATEGORY_ICONS } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { getSpecChips } from '../lib/telemetry';

export function SkeletonRow() {
  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-4 animate-pulse" aria-hidden="true">
      <div className="flex items-center gap-4 flex-1">
        <div className="w-11 h-11 bg-surface-2 rounded-lg shrink-0" />
        <div className="flex flex-col gap-2 w-full">
          <div className="w-28 h-4 bg-surface-2 rounded" />
          <div className="w-3/4 sm:w-64 h-4 bg-surface-2 rounded" />
        </div>
      </div>
      <div className="w-20 h-6 bg-surface-2 rounded" />
    </div>
  );
}

export default function PartRow({ category, item, isRequired, dependency, isCore, onRemove }) {
  const Icon = CATEGORY_ICONS[category] || Box;
  const chips = item ? getSpecChips(category, item.name) : [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className={`card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
        item ? '' : 'border-dashed bg-transparent'
      }`}
    >
      <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
        <div
          className={`p-3 rounded-lg shrink-0 ${
            item
              ? isCore
                ? 'bg-accent-soft text-accent'
                : 'bg-surface-2 text-fg-2'
              : 'bg-surface-2 text-fg-3'
          }`}
          aria-hidden="true"
        >
          <Icon size={isCore ? 24 : 20} strokeWidth={1.5} />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-semibold tracking-tight ${isCore ? 'text-lg text-fg' : 'text-base text-fg'}`}>
              {category}
            </span>
            {isRequired && !item && (
              <span className="text-xs font-medium bg-bad-soft text-bad px-2 py-0.5 rounded border border-bad-line">
                Required
              </span>
            )}
            {dependency && (
              <span className="text-xs text-fg-3">Must match {dependency}</span>
            )}
          </div>

          {item ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-2 min-w-0">
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="w-12 h-12 object-contain rounded-lg bg-white p-1 shrink-0 border border-line"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-fg font-medium text-sm sm:text-base leading-snug line-clamp-2">
                  {item.name}
                </div>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {chips.map((chip) => (
                      <span key={chip} className="spec-tag">{chip}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-fg-3 text-sm mt-1">Not selected</div>
          )}
        </div>
      </div>

      {item && (
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-line">
          <div className="num font-semibold text-lg sm:text-xl text-fg whitespace-nowrap">
            {formatPrice(item.price)}
          </div>
          <div className="flex items-center gap-1.5">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-icon"
                title="View on retailer site"
                aria-label={`View ${category} on retailer site`}
              >
                <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onRemove(category)}
              className="btn btn-icon hover:text-bad hover:border-bad-line"
              title="Remove part"
              aria-label={`Remove ${category}`}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
