import { m } from 'framer-motion';
import { spring, tween, stagger } from '../lib/motion';
import { Box, ExternalLink, Trash2, ArrowLeftRight, Lock } from 'lucide-react';
import { CATEGORY_ICONS, partRowId } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { formatDelta, deltaTone } from '../lib/buildDiff';
import { getSpecChips } from '../lib/telemetry';
import { describeFreshness } from '../lib/time';
import RowMenu from './RowMenu';
import PartImage from './PartImage';

// `label` names the part being searched again, so a refine shows which rows are working.
export function SkeletonRow({ label }) {
  return (
    <div
      className={`skeleton card px-4 py-3 flex items-center gap-3 min-h-16 ${label ? 'border-accent-line' : ''}`}
      aria-hidden="true"
    >
      <div className="w-10 h-10 bg-surface-2 rounded-lg shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        {label ? <span className="text-xs font-medium text-accent">Finding a new {label}...</span> : <div className="w-20 h-3 bg-surface-2 rounded" />}
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
  exit: { opacity: 0, transition: tween.exit },
  transition: { ...spring.smooth, opacity: tween.base, delay: stagger(index) },
});

const BADGE = {
  added: { label: 'New', className: 'bg-ok-soft text-ok border-ok-line' },
  changed: { label: 'Changed', className: 'bg-accent-soft text-accent border-accent-line' },
  removed: { label: 'Removed', className: 'bg-surface-2 text-fg-2 border-line-strong' },
};

// What the last refine did to a row: one small tag, its own color, the price change sits beside it.
function ChangeBadge({ kind }) {
  const { label, className } = BADGE[kind];
  return (
    <span className={`inline-flex items-center h-5 px-1.5 rounded-md border text-[11px] font-semibold leading-none ${className}`}>
      {label}
    </span>
  );
}

/**
 * A part the last refine took out. It stays readable as what was there: the old part, struck
 * through as the row settles, and what removing it saved.
 */
function RemovedRow({ category, part, delta, index, Icon }) {
  const settle = { ...tween.slow, delay: 0.12 + stagger(index, 0.05) };

  return (
    <m.div
      {...rowMotion(index)}
      id={partRowId(category)}
      className="part-row relative overflow-hidden rounded-xl border border-dashed border-line-strong px-3 sm:px-4 py-2.5 min-h-14 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 scroll-mt-40"
    >
      <m.div
        className="w-10 h-10 rounded-lg shrink-0 overflow-hidden"
        initial={{ opacity: 1, filter: 'grayscale(0)' }}
        animate={{ opacity: 0.45, filter: 'grayscale(1)' }}
        transition={settle}
        aria-hidden="true"
      >
        <PartImage
          src={part.image}
          className="w-full h-full object-contain bg-white p-0.5 border border-line rounded-lg"
          fallback={(
            <div className="w-full h-full bg-surface-2 text-fg-3 flex items-center justify-center">
              <Icon size={18} strokeWidth={1.5} />
            </div>
          )}
        />
      </m.div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-3">{category}</span>
          <ChangeBadge kind="removed" />
        </div>
        <div className="relative max-w-full w-fit">
          <m.p
            className="text-sm text-fg-2 truncate"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0.75 }}
            transition={settle}
            title={part.name}
          >
            {part.name}
          </m.p>
          <m.span
            className="absolute left-0 right-0 top-1/2 h-px bg-fg-3 origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={settle}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="text-right">
        <div className={`num text-sm font-semibold ${deltaTone(delta)}`}>{formatDelta(delta)}</div>
        <div className="text-xs text-fg-3">saved</div>
      </div>
    </m.div>
  );
}

/**
 * One line per part (two on phones). Empty optional rows are dashed and quiet;
 * empty required rows say so.
 */
export default function PartRow({
  category, item, isRequired, dependency, isCore, index = 0, onRemove, onSwap,
  kept = false, change = null,
}) {
  const Icon = CATEGORY_ICONS[category] || Box;

  if (!item && change?.before) {
    return <RemovedRow category={category} part={change.before} delta={change.delta} index={index} Icon={Icon} />;
  }

  if (!item) {
    return (
      <m.div
        {...rowMotion(index)}
        id={partRowId(category)}
        className="part-row flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 sm:px-4 py-2 min-h-14 scroll-mt-40"
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
      </m.div>
    );
  }

  const chips = getSpecChips(category, item);
  const freshness = describeFreshness(item.updatedAt);

  return (
    <m.div
      {...rowMotion(index)}
      id={partRowId(category)}
      className={`part-row card relative overflow-hidden px-3 sm:px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 scroll-mt-40 transition-opacity duration-300 ${
        kept ? 'opacity-60' : ''
      }`}
    >
      {change && (
        <span
          className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full ${change.before ? 'bg-accent' : 'bg-ok'}`}
          aria-hidden="true"
        />
      )}
      <PartImage
        src={item.image}
        className="w-10 h-10 object-contain rounded-lg bg-white p-0.5 border border-line shrink-0"
        fallback={(
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isCore ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2'
            }`}
            aria-hidden="true"
          >
            <Icon size={20} strokeWidth={1.5} />
          </div>
        )}
      />

      <div className="min-w-0">
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <span className="text-xs font-medium text-fg-3">{category}</span>
          {kept && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-3">
              <Lock size={11} aria-hidden="true" />
              Kept
            </span>
          )}
          {change && (
            <span className="inline-flex items-center gap-1.5">
              <ChangeBadge kind={change.before ? 'changed' : 'added'} />
              <span className={`num text-xs font-medium ${deltaTone(change.delta)}`}>{formatDelta(change.delta)}</span>
            </span>
          )}
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
        {change?.before && (
          <div className="text-xs text-fg-3 truncate" title={change.before.name}>
            Was {change.before.name}{' '}
            <span className="num line-through">{formatPrice(change.before.price)}</span>
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 sm:hidden">
            {chips.slice(0, 2).map((chip) => (
              <span key={chip} className="spec-tag">{chip}</span>
            ))}
          </div>
        )}
      </div>

      <div className="hidden sm:block text-right min-w-24">
        <div className="num font-semibold text-lg text-fg whitespace-nowrap">{formatPrice(item.price)}</div>
        {freshness && (
          <div
            className={`text-xs whitespace-nowrap ${freshness.stale ? 'text-warn' : 'text-fg-3'}`}
            title={freshness.stale ? 'This listing has not been refreshed recently; the price may have changed.' : undefined}
          >
            {freshness.label}
          </div>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5">
        {onSwap && (
          <button
            type="button"
            onClick={() => onSwap(category)}
            className="btn btn-icon-sm"
            title="Swap for a compatible alternative"
            aria-label={`Swap ${category}`}
          >
            <ArrowLeftRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
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

      <RowMenu category={category} url={item.url} onRemove={onRemove} onSwap={onSwap} />
    </m.div>
  );
}
