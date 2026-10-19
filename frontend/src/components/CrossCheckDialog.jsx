import { useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { backdrop, dialog, sheet, spring } from '../lib/motion';
import {
  X, Columns3, RefreshCw, ExternalLink, Check, Equal, Shuffle, Ban, Plus, Loader2, Trophy, AlertTriangle, Box,
  ArrowRight, ChevronDown,
} from 'lucide-react';
import { CATEGORY_ICONS, INITIAL_BUILD, SITE_OPTIONS } from '../lib/constants';
import { formatPrice, sumBuild } from '../lib/format';
import { MATCH_META, MATCH_HELP, bestStore, partCount } from '../lib/crossCheck';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useSheetDrag } from '../hooks/useSheetDrag';
import SheetGrabber from './SheetGrabber';
import AnimatedPrice from './AnimatedPrice';
import StatusChip from './StatusChip';

const MATCH_ICONS = { exact: Check, equivalent: Equal, substitute: Shuffle, missing: Ban, added: Plus };
const STATE_TEXT = {
  queued: 'Waiting to start',
  matching: 'Finding the same parts',
  building: 'Filling the gaps',
};
// Segment colours of the match bar, in the order they are drawn.
const MATCH_SEGMENTS = [
  { key: 'exact', className: 'bg-ok' },
  { key: 'equivalent', className: 'bg-accent' },
  { key: 'substitute', className: 'bg-warn' },
  { key: 'missing', className: 'bg-bad' },
];
const CATEGORIES = Object.keys(INITIAL_BUILD);
const siteOption = (site) => SITE_OPTIONS.find((o) => o.value === site) || { value: site, label: site, short: '?' };
const usable = (col) => col.isReference || (col.result && col.result.status !== 'unavailable');

function StoreBadge({ site, size = 'md' }) {
  return (
    <span
      className={`shrink-0 rounded-md bg-accent-soft text-accent border border-accent-line flex items-center justify-center font-semibold ${
        size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[11px]'
      }`}
      aria-hidden="true"
    >
      {siteOption(site).short}
    </span>
  );
}

function MatchChip({ match }) {
  const meta = MATCH_META[match];
  if (!meta) return null;
  return (
    <span title={MATCH_HELP[match]}>
      <StatusChip tone={meta.tone} icon={MATCH_ICONS[match]} className="!px-2 !py-0.5">{meta.label}</StatusChip>
    </span>
  );
}

function Delta({ amount, className = '' }) {
  if (!amount) return null;
  const cheaper = amount < 0;
  return (
    <span className={`num ${cheaper ? 'text-ok' : 'text-fg-3'} ${className}`}>
      {cheaper ? '−' : '+'}{formatPrice(Math.abs(amount))}
    </span>
  );
}

/**
 * Everything known about each store, in the order to show them: once results are in, complete
 * stores cheapest first, then partial ones, then stores that can't supply the build. Until then the
 * user's store leads and the others follow in the usual order.
 */
function useColumns({ check, referenceSite, build }) {
  return useMemo(() => {
    const data = check.status === 'done' ? check.data : null;
    const refBuild = data?.reference.build || build;
    const reference = {
      site: referenceSite,
      label: siteOption(referenceSite).label,
      isReference: true,
      build: refBuild,
      total: data ? data.reference.total : sumBuild(build),
      outOfStock: data?.reference.outOfStock || [],
      ready: true,
    };
    const stores = SITE_OPTIONS.filter((o) => o.value !== referenceSite).map((o) => {
      const result = data?.results.find((r) => r.site === o.value) || null;
      return {
        site: o.value,
        label: o.label,
        result,
        build: result?.build || null,
        total: result?.total ?? null,
        state: check.progress?.[o.value] || (check.status === 'running' ? 'queued' : null),
        ready: Boolean(result),
      };
    });

    const { bestSite, cheapest, saving } = bestStore(data);
    const tier = (c) => (c.isReference ? (c.outOfStock.length ? 1 : 0) : ({ ok: 0, partial: 1 }[c.result?.status] ?? 2));
    const all = [reference, ...stores];
    const ordered = data
      ? [...all].sort((a, b) => tier(a) - tier(b) || (a.total ?? Infinity) - (b.total ?? Infinity))
      : all;
    const rows = CATEGORIES.filter((c) => refBuild[c] || stores.some((s) => s.build?.[c]));
    return { columns: all, ordered, rows, bestSite, cheapest, saving, data };
  }, [check.status, check.data, check.progress, referenceSite, build]);
}

/** Lowest price per row among parts that are the same or an equivalent, so mixing stores is easy to spot. */
function useLowest(columns, rows) {
  return useMemo(() => {
    const lowest = {};
    for (const category of rows) {
      let best = null;
      for (const col of columns) {
        const part = col.build?.[category];
        const match = col.isReference ? 'exact' : col.result?.matches?.[category];
        if (!part || !['exact', 'equivalent'].includes(match)) continue;
        if (!best || part.price < best.price) best = { site: col.site, price: part.price };
      }
      // Only worth pointing at when it beats the user's own part.
      const ref = columns.find((c) => c.isReference);
      const mine = ref?.build?.[category]?.price;
      if (best && best.site !== ref?.site && mine !== undefined && best.price < mine) lowest[category] = best.site;
    }
    return lowest;
  }, [columns, rows]);
}

/** How much of the user's build a store matched: one bar, one colour per kind of match. */
function MatchBar({ col }) {
  if (col.isReference) {
    const total = Object.values(col.build).filter(Boolean).length;
    const sold = col.outOfStock.length;
    return (
      <div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-line gap-px" aria-hidden="true">
          <span className="bg-ok" style={{ flexGrow: total - sold }} />
          {sold > 0 && <span className="bg-warn" style={{ flexGrow: sold }} />}
        </div>
        <p className="mt-1.5 text-xs text-fg-3">
          {sold > 0 ? `${sold} of ${total} parts sold out since your build` : `All ${total} parts, as built`}
        </p>
      </div>
    );
  }
  const counts = col.result.counts || {};
  const { same, total } = partCount(col.result);
  const parts = [
    same && `${same} same`,
    counts.equivalent && `${counts.equivalent} equivalent`,
    counts.substitute && `${counts.substitute} substitute`,
    counts.missing && `${counts.missing} missing`,
  ].filter(Boolean);
  return (
    <div>
      <div
        className="flex h-1.5 rounded-full overflow-hidden bg-line gap-px"
        role="img"
        aria-label={`${same} of ${total} parts are the same model`}
      >
        {MATCH_SEGMENTS.map(({ key, className }) => (counts[key] ? (
          <span key={key} className={className} style={{ flexGrow: counts[key] }} title={MATCH_HELP[key]} />
        ) : null))}
      </div>
      <p className="mt-1.5 text-xs text-fg-3">{parts.join(' · ')}</p>
    </div>
  );
}

function SwitchButton({ col, best, stale, onAdopt, compact = false }) {
  if (col.isReference || !usable(col)) return null;
  return (
    <button
      type="button"
      onClick={() => onAdopt(col.result)}
      disabled={stale}
      title={stale ? 'Your build changed. Check again first.' : `Make this ${col.label} build your working build`}
      className={`btn btn-touch w-full ${best ? 'btn-primary' : ''} ${compact ? '' : 'mt-auto'}`}
    >
      Switch to {col.label}
      <ArrowRight size={15} aria-hidden="true" />
    </button>
  );
}

/** One store at a glance: total, how it compares, how faithful a copy of the build it is. */
function StoreCard({ col, best, budget, stale, onAdopt, selectable, selected, onSelect }) {
  const running = !col.isReference && !col.ready;
  const result = col.result;
  const unavailable = result?.status === 'unavailable';

  const head = (
    <>
      <div className="flex items-start gap-2 min-w-0">
        <StoreBadge site={col.site} />
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-fg leading-8">{col.label}</span>
          {best && <StatusChip tone="ok" icon={Trophy} className="!px-2 !py-0.5">Cheapest</StatusChip>}
          {col.isReference && <StatusChip className="!px-2 !py-0.5">Your store</StatusChip>}
        </div>
        {selectable && (
          <ChevronDown size={16} className={`mt-2 shrink-0 text-fg-3 transition-transform ${selected ? 'rotate-180' : ''}`} aria-hidden="true" />
        )}
      </div>

      {running ? (
        <div className="mt-3 space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs text-fg-3" role="status">
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {STATE_TEXT[col.state] || 'Checking stock'}…
          </p>
          <div className="skeleton space-y-2" aria-hidden="true">
            <div className="h-7 w-32 rounded-md bg-surface-2" />
            <div className="h-1.5 w-full rounded-full bg-surface-2" />
          </div>
        </div>
      ) : unavailable ? (
        <div className="mt-3 cc-in">
          <StatusChip tone="bad" icon={Ban} className="!px-2 !py-0.5">Can't build</StatusChip>
          <p className="mt-2 text-sm text-fg-2 leading-relaxed line-clamp-3">{result.error}</p>
        </div>
      ) : (
        <div className={`mt-3 ${col.isReference ? '' : 'cc-in'}`}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <AnimatedPrice
              value={col.total}
              from={col.isReference ? undefined : 0}
              className="num text-2xl font-bold text-fg tracking-tight"
            />
            {col.isReference
              ? <span className="text-xs text-fg-3">your build</span>
              : result.delta === 0
                ? <span className="text-xs text-fg-3">same total</span>
                : (
                  <span className={`text-xs font-medium ${result.delta < 0 ? 'text-ok' : 'text-fg-3'}`}>
                    <span className="num">{formatPrice(Math.abs(result.delta))}</span> {result.delta < 0 ? 'less' : 'more'}
                  </span>
                )}
          </div>
          <div className="mt-3">
            <MatchBar col={col} />
          </div>
          {(result?.status === 'partial' || (result?.overBudget && budget > 0)) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {result.status === 'partial' && (
                <StatusChip tone="warn" icon={AlertTriangle} className="!px-2 !py-0.5">{result.counts.missing} not in stock</StatusChip>
              )}
              {result.overBudget && budget > 0 && <StatusChip tone="warn" className="!px-2 !py-0.5">Over budget</StatusChip>}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`card p-4 flex flex-col gap-3 h-full [contain:layout_style] transition-[border-color,box-shadow] duration-200 ${
        best ? 'border-ok-line' : ''
      } ${selected ? 'ring-2 ring-accent/60 border-accent-line' : ''}`}
    >
      {selectable ? (
        <button type="button" onClick={onSelect} aria-pressed={selected} className="text-left -m-1 p-1 rounded-lg">
          {head}
        </button>
      ) : (
        <div>{head}</div>
      )}
      {!selectable && <SwitchButton col={col} best={best} stale={stale} onAdopt={onAdopt} />}
    </div>
  );
}

/** The answer, before any detail: where to buy, how much it saves, and the one button to act on it. */
function Verdict({ ordered, bestSite, cheapest, saving, stale, onAdopt, running }) {
  if (running) {
    return (
      <div className="rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5 flex items-center gap-3" role="status">
        <Loader2 size={18} className="text-accent animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-fg">Pricing your build at every store…</p>
          <p className="text-sm text-fg-3">Matching each part, then filling any gaps with the closest equivalent.</p>
        </div>
      </div>
    );
  }
  const reference = ordered.find((c) => c.isReference);
  const best = ordered.find((c) => c.site === bestSite);
  const winner = saving > 0 && best && !best.isReference ? best : null;

  let title;
  let detail;
  if (winner) {
    const { same, total } = partCount(winner.result);
    title = <>Save <span className="num">{formatPrice(saving)}</span> at {winner.label}</>;
    detail = same === total ? 'Every part is the same model.' : `${same} of ${total} parts are the same model; the rest are close equivalents or substitutes.`;
  } else if (!cheapest) {
    title = `Only ${reference.label} has every part`;
    detail = 'The other stores are missing at least one part of this build right now.';
  } else if (saving === 0) {
    title = `${cheapest.label} matches your price`;
    detail = `Same total as ${reference.label}, so there's nothing to gain by switching.`;
  } else {
    title = `${reference.label} is already the cheapest`;
    detail = <>Next best is {cheapest.label}, <span className="num">{formatPrice(-saving)}</span> more.</>;
  }

  return (
    <div
      className={`cc-in rounded-2xl border p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-3 ${
        winner ? 'border-ok-line bg-ok-soft' : 'border-line bg-surface-2/60'
      }`}
      role="status"
    >
      <span
        className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border ${
          winner ? 'bg-ok-soft border-ok-line text-ok' : 'bg-surface border-line text-fg-2'
        }`}
        aria-hidden="true"
      >
        {winner ? <Trophy size={20} /> : <Check size={20} />}
      </span>
      <div className="min-w-0 flex-1 basis-[12rem]">
        <p className="text-lg font-semibold text-fg tracking-tight leading-snug">{title}</p>
        <p className="text-sm text-fg-2 mt-0.5">{detail}</p>
      </div>
      {winner && (
        <div className="w-full sm:w-56 shrink-0">
          <SwitchButton col={winner} best stale={stale} onAdopt={onAdopt} compact />
        </div>
      )}
    </div>
  );
}

function PartCell({ col, category, refPart, lowest, index }) {
  if (!col.isReference && !col.ready) {
    return (
      <div className="skeleton space-y-1.5" aria-hidden="true">
        <div className="h-3.5 w-full rounded bg-surface-2" />
        <div className="h-3.5 w-2/3 rounded bg-surface-2" />
      </div>
    );
  }
  const part = col.build?.[category];
  const match = col.isReference ? null : col.result?.matches?.[category];
  if (!part) {
    if (!match) return <span className="text-fg-3">—</span>;
    return <MatchChip match={match} />;
  }
  const soldOut = col.isReference && col.outOfStock.includes(category);
  const diff = !col.isReference && refPart ? part.price - refPart.price : 0;
  return (
    // CSS entrance (not a framer node per cell): dozens of cells land at once when results arrive.
    <div
      className={`flex flex-col gap-1.5 min-w-0 ${col.isReference ? '' : 'cc-in'}`}
      style={col.isReference ? undefined : { animationDelay: `${Math.min(index, 10) * 25}ms` }}
    >
      {part.url ? (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group text-fg leading-snug line-clamp-2 hover:text-accent"
          title={`${part.name} — opens ${col.label}`}
        >
          {part.name}
          <ExternalLink size={12} className="inline ml-1 -mt-0.5 text-fg-3 group-hover:text-accent" aria-hidden="true" />
        </a>
      ) : (
        <span className="text-fg leading-snug line-clamp-2">{part.name}</span>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`num font-semibold ${lowest ? 'text-ok' : 'text-fg'}`}>{formatPrice(part.price)}</span>
        <Delta amount={diff} className="text-xs" />
        {soldOut && <span className="text-xs text-warn">Sold out</span>}
        {match && match !== 'exact' && <MatchChip match={match} />}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-fg-3" aria-label="What the colours mean">
      {MATCH_SEGMENTS.map(({ key, className }) => (
        <li key={key} className="flex items-center gap-1.5" title={MATCH_HELP[key]}>
          <span className={`w-2 h-2 rounded-full ${className}`} aria-hidden="true" />
          {MATCH_META[key].label}
        </li>
      ))}
    </ul>
  );
}

function CompareTable({ columns, rows, bestSite }) {
  const lowest = useLowest(columns, rows);
  const refBuild = columns.find((c) => c.isReference)?.build;
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Your build priced at each store, part by part</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface w-36 px-3 py-2.5 text-left text-xs font-medium text-fg-3 border-b border-line">Part</th>
            {columns.map((col) => (
              <th
                key={col.site}
                scope="col"
                className={`px-3 py-2.5 text-left font-normal border-b border-line ${col.site === bestSite ? 'bg-ok-soft' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <StoreBadge site={col.site} size="sm" />
                  <span className="text-xs font-semibold text-fg truncate">{col.label}</span>
                  {col.isReference && <span className="text-[11px] text-fg-3">yours</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((category, rowIndex) => {
            const Icon = CATEGORY_ICONS[category] || Box;
            return (
              <tr key={category} className="group/row">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left align-top border-b border-line">
                  <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
                    <Icon size={15} className="text-fg-3 shrink-0" aria-hidden="true" />
                    {category}
                  </span>
                </th>
                {columns.map((col) => {
                  if (col.result?.status === 'unavailable') {
                    if (rowIndex > 0) return null;
                    return (
                      <td key={col.site} rowSpan={rows.length} className="px-3 py-3 align-top border-b border-line">
                        <p className="text-sm text-fg-3 leading-relaxed max-w-[15rem]">Can't build this here. {col.result.error}</p>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.site}
                      className={`px-3 py-3 align-top border-b border-line transition-colors group-hover/row:bg-surface-2/50 ${
                        col.site === bestSite ? 'bg-ok-soft' : ''
                      }`}
                    >
                      <PartCell
                        col={col}
                        category={category}
                        refPart={refBuild?.[category]}
                        lowest={lowest[category] === col.site}
                        index={rowIndex}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Phones: the selected store's parts, each against the user's own. */
function StoreParts({ col, columns, rows }) {
  const lowest = useLowest(columns, rows);
  if (!usable(col)) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((category, index) => {
        const Icon = CATEGORY_ICONS[category] || Box;
        const mine = columns.find((c) => c.isReference)?.build?.[category];
        return (
          <li key={category} className="card p-3 flex flex-col gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
              <Icon size={15} className="text-fg-3" aria-hidden="true" />
              {category}
            </span>
            <PartCell col={col} category={category} refPart={mine} lowest={lowest[category] === col.site} index={index} />
            {!col.isReference && mine && (
              <p className="text-xs text-fg-3 line-clamp-1">
                Yours: {mine.name} · <span className="num">{formatPrice(mine.price)}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Compare stores": the answer first (where to buy and what it saves), then every store at a glance
 * (ranked, with how faithful a copy of the build each one is), then the part-by-part detail.
 * A store can be made the working build in one click (undoable).
 */
export default function CrossCheckDialog({ open, onClose, isNarrow, check, referenceSite, build, budget, onRun, onAdopt }) {
  const dialogRef = useDialogFocus(open, onClose);
  const { sheetProps, handleProps } = useSheetDrag(isNarrow, onClose);
  const { columns, ordered, rows, bestSite, cheapest, saving, data } = useColumns({ check, referenceSite, build });
  const [picked, setPicked] = useState(null);
  const running = check.status === 'running';
  const checkedAt = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  // Phones show one store's parts at a time: the one tapped, else the cheapest, else the next one along.
  const selectedSite = picked || (bestSite !== referenceSite ? bestSite : null) || ordered.find((c) => !c.isReference)?.site;
  const selected = ordered.find((c) => c.site === selectedSite) || ordered[0];

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="cross-check-backdrop"
          {...backdrop}
          className="fixed inset-0 z-50 bg-[var(--scrim)] flex items-end sm:items-center justify-center sm:p-6 print:hidden"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <m.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cross-check-title"
            aria-describedby="cross-check-lead"
            tabIndex={-1}
            {...(isNarrow ? sheet(true) : dialog)}
            {...sheetProps}
            className="surface-float bg-surface border border-line flex flex-col w-full
              max-h-[92vh] rounded-t-2xl sm:rounded-2xl sm:max-w-6xl sm:max-h-[88vh]"
          >
            <SheetGrabber {...handleProps} />
            <div {...handleProps} className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-1 sm:pt-4 pb-3 border-b border-line">
              <div className="min-w-0">
                <h2 id="cross-check-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
                  <Columns3 size={18} className="text-accent" aria-hidden="true" />
                  Compare stores
                </h2>
                <p id="cross-check-lead" className="text-xs text-fg-3 mt-0.5">
                  {running ? 'Checking live stock and prices…' : checkedAt ? `Prices checked at ${checkedAt}` : 'Your build, priced at every store'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {check.status === 'done' && !check.stale && (
                  <button type="button" onClick={onRun} className="btn" aria-label="Check prices again">
                    <RefreshCw size={14} aria-hidden="true" />
                    <span className="hidden sm:inline">Check again</span>
                  </button>
                )}
                <button type="button" onClick={onClose} aria-label="Close" className="btn btn-icon">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
              {check.stale && !running && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm" role="status">
                  <AlertTriangle size={16} className="text-warn shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-[12rem] text-fg">Your build changed after this check, so these prices are for the earlier build.</span>
                  <button type="button" onClick={onRun} className="btn">
                    <RefreshCw size={14} aria-hidden="true" /> Check again
                  </button>
                </div>
              )}

              {check.status === 'error' ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-bad-line bg-bad-soft px-4 py-3 text-sm">
                  <span className="flex-1 min-w-[12rem] text-fg">{check.error}</span>
                  <button type="button" onClick={onRun} className="btn">
                    <RefreshCw size={14} aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : (
                <>
                  {!check.stale && (
                    <Verdict
                      ordered={ordered}
                      bestSite={bestSite}
                      cheapest={cheapest}
                      saving={saving}
                      stale={check.stale}
                      onAdopt={onAdopt}
                      running={running || !data}
                    />
                  )}

                  <section aria-label="Stores">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {ordered.map((col) => (
                        // Cards re-sort cheapest-first when results land; layout glides them into place.
                        <m.div
                          key={col.site}
                          layout="position"
                          layoutDependency={`${check.status}|${data?.checkedAt || ''}`}
                          transition={spring.smooth}
                        >
                          <StoreCard
                            col={col}
                            best={col.site === bestSite && Boolean(data)}
                            budget={budget}
                            stale={check.stale}
                            onAdopt={onAdopt}
                            selectable={isNarrow && usable(col)}
                            selected={isNarrow && col.site === selected.site}
                            onSelect={() => setPicked(col.site)}
                          />
                        </m.div>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="cross-check-parts" className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <h3 id="cross-check-parts" className="text-sm font-semibold text-fg">
                        {isNarrow ? `Parts at ${selected.label}` : 'Part by part'}
                      </h3>
                      {!isNarrow && <Legend />}
                    </div>
                    {isNarrow
                      ? <StoreParts col={selected} columns={columns} rows={rows} />
                      : <CompareTable columns={ordered} rows={rows} bestSite={data ? bestSite : null} />}
                  </section>
                </>
              )}
            </div>

            {/* Phones: the switch for the store being looked at stays in reach. */}
            {isNarrow && !selected.isReference && usable(selected) && check.status === 'done' && (
              <div className="px-4 py-3 border-t border-line bg-surface">
                <SwitchButton col={selected} best={selected.site === bestSite} stale={check.stale} onAdopt={onAdopt} compact />
              </div>
            )}
          </m.section>
        </m.div>
      )}
    </AnimatePresence>
  );
}
