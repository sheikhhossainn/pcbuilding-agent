import { useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { backdrop, dialog, sheet } from '../lib/motion';
import {
  X, Columns3, RefreshCw, ExternalLink, Check, Equal, Shuffle, Ban, Plus, Loader2, Trophy, AlertTriangle, Box,
} from 'lucide-react';
import { CATEGORY_ICONS, INITIAL_BUILD, SITE_OPTIONS } from '../lib/constants';
import { formatPrice, sumBuild } from '../lib/format';
import { MATCH_META, MATCH_HELP, bestStore, crossCheckHeadline, partCount } from '../lib/crossCheck';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useSheetDrag } from '../hooks/useSheetDrag';
import SheetGrabber from './SheetGrabber';
import AnimatedPrice from './AnimatedPrice';
import { spring, tween } from '../lib/motion';
import StatusChip from './StatusChip';

const MATCH_ICONS = { exact: Check, equivalent: Equal, substitute: Shuffle, missing: Ban, added: Plus };
const STATE_TEXT = {
  queued: 'Waiting to start',
  matching: 'Finding the same parts',
  building: 'Filling the gaps',
};
const CATEGORIES = Object.keys(INITIAL_BUILD);
const siteOption = (site) => SITE_OPTIONS.find((o) => o.value === site) || { value: site, label: site, short: '?' };

function StoreBadge({ site }) {
  return (
    <span
      className="w-7 h-7 shrink-0 rounded-md bg-accent-soft text-accent border border-accent-line flex items-center justify-center text-[11px] font-semibold"
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

/** Everything known about one store: its result once in, its progress until then. */
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
    const { cheapest } = bestStore(data);
    const rows = CATEGORIES.filter((c) => refBuild[c] || stores.some((s) => s.build?.[c]));
    return { columns: [reference, ...stores], rows, bestSite: cheapest?.site || null, data };
  }, [check.status, check.data, check.progress, referenceSite, build]);
}

function ColumnHeader({ col, best, budget }) {
  const result = col.result;
  const running = !col.isReference && !col.ready;
  const count = result ? partCount(result) : null;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <StoreBadge site={col.site} />
        <span className="font-semibold text-fg truncate">{col.label}</span>
      </div>

      {running && (
        <p className="flex items-center gap-1.5 text-xs text-fg-3" role="status">
          <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {STATE_TEXT[col.state] || 'Checking stock'}…
        </p>
      )}

      {(col.isReference || (result && result.status !== 'unavailable')) && (
        <div>
          <AnimatedPrice
            value={col.total}
            from={col.isReference ? undefined : 0}
            className="block num text-xl font-bold text-fg tracking-tight"
          />
          <div className="text-xs text-fg-3 flex flex-wrap gap-x-2">
            {col.isReference ? <span>Your build</span> : (
              <>
                {result.delta === 0 ? <span>Same total</span> : <Delta amount={result.delta} className="font-medium" />}
                <span>{count.same} of {count.total} same part</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {best && (
          // Lands last, with a little bounce: this is the answer the user came for.
          <m.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring.snappy, damping: 18, delay: 0.35, opacity: tween.fast }}
          >
            <StatusChip tone="ok" icon={Trophy} className="!px-2 !py-0.5">Best price</StatusChip>
          </m.span>
        )}
        {result?.status === 'partial' && (
          <StatusChip tone="warn" icon={AlertTriangle} className="!px-2 !py-0.5">{result.counts.missing} not in stock</StatusChip>
        )}
        {result?.status === 'unavailable' && <StatusChip tone="bad" icon={Ban} className="!px-2 !py-0.5">Can't build</StatusChip>}
        {result?.overBudget && budget > 0 && (
          <StatusChip tone="warn" className="!px-2 !py-0.5">Over budget</StatusChip>
        )}
        {col.isReference && col.outOfStock.length > 0 && (
          <StatusChip tone="warn" icon={AlertTriangle} className="!px-2 !py-0.5">{col.outOfStock.length} sold out</StatusChip>
        )}
      </div>
    </div>
  );
}

function PartCell({ col, category, refPart, lowest }) {
  if (!col.isReference && !col.ready) {
    return (
      <div className="skeleton space-y-1.5" aria-hidden="true">
        <div className="h-3.5 w-full rounded bg-surface-2" />
        <div className="h-3.5 w-2/3 rounded bg-surface-2" />
        <div className="h-5 w-20 rounded-full bg-surface-2" />
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
    // A store's parts settle in as its result arrives, in place of the skeleton.
    <m.div
      className="flex flex-col gap-1.5 min-w-0"
      initial={col.isReference ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.smooth, opacity: tween.base }}
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
      </div>
      {match && <div><MatchChip match={match} /></div>}
    </m.div>
  );
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
      const mine = columns[0].build?.[category]?.price;
      if (best && best.site !== columns[0].site && mine !== undefined && best.price < mine) lowest[category] = best.site;
    }
    return lowest;
  }, [columns, rows]);
}

function SwitchButton({ col, best, stale, onAdopt, className = '' }) {
  if (col.isReference) return <p className="text-xs text-fg-3 text-center py-2">Current build</p>;
  const usable = col.result && col.result.status !== 'unavailable';
  if (!usable) return null;
  return (
    <button
      type="button"
      onClick={() => onAdopt(col.result)}
      disabled={stale}
      title={stale ? 'Your build changed. Check again first.' : `Make this ${col.label} build your working build`}
      className={`btn btn-touch w-full ${best ? 'btn-primary' : ''} ${className}`}
    >
      Switch to {col.label}
    </button>
  );
}

function Legend() {
  return (
    <ul className="hidden sm:flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-3" aria-label="What the labels mean">
      {['exact', 'equivalent', 'substitute', 'missing'].map((m) => (
        <li key={m} className="flex items-center gap-1.5">
          <MatchChip match={m} />
          <span className="hidden md:inline">{MATCH_HELP[m]}</span>
        </li>
      ))}
    </ul>
  );
}

function CompareTable({ columns, rows, bestSite, budget, stale, onAdopt }) {
  const lowest = useLowest(columns, rows);
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Your build priced at each store, part by part</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface w-32 p-3 text-left text-xs font-medium text-fg-3 align-bottom">Part</th>
            {columns.map((col) => (
              <th
                key={col.site}
                scope="col"
                className={`p-3 text-left align-top font-normal border-b border-line ${col.site === bestSite ? 'bg-ok-soft rounded-t-xl' : ''}`}
              >
                <ColumnHeader col={col} best={col.site === bestSite} budget={budget} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((category, rowIndex) => {
            const Icon = CATEGORY_ICONS[category] || Box;
            return (
              <tr key={category}>
                <th scope="row" className="sticky left-0 z-10 bg-surface p-3 text-left align-top border-b border-line">
                  <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
                    <Icon size={15} className="text-fg-3 shrink-0" aria-hidden="true" />
                    {category}
                  </span>
                </th>
                {columns.map((col) => {
                  if (col.result?.status === 'unavailable') {
                    if (rowIndex > 0) return null;
                    return (
                      <td key={col.site} rowSpan={rows.length} className="p-3 align-top border-b border-line">
                        <p className="text-sm text-fg-2 leading-relaxed max-w-[16rem]">{col.result.error}</p>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.site}
                      className={`p-3 align-top border-b border-line ${col.site === bestSite ? 'bg-ok-soft' : ''}`}
                    >
                      <PartCell
                        col={col}
                        category={category}
                        refPart={columns[0].build?.[category]}
                        lowest={lowest[category] === col.site}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky left-0 z-10 bg-surface" />
            {columns.map((col) => (
              <td key={col.site} className={`p-3 align-top ${col.site === bestSite ? 'bg-ok-soft rounded-b-xl' : ''}`}>
                <SwitchButton col={col} best={col.site === bestSite} stale={stale} onAdopt={onAdopt} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CompareTabs({ columns, rows, bestSite, budget, stale, onAdopt }) {
  const [picked, setPicked] = useState(null);
  const selectedSite = picked || bestSite || columns[1]?.site || columns[0].site;
  const col = columns.find((c) => c.site === selectedSite) || columns[0];
  const lowest = useLowest(columns, rows);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Stores" className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {columns.map((c) => {
          const selected = c.site === selectedSite;
          return (
            <button
              key={c.site}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="cross-check-panel"
              onClick={() => setPicked(c.site)}
              className={`shrink-0 min-h-11 px-3 rounded-xl border flex items-center gap-2 text-sm ${
                selected ? 'border-accent-line bg-accent-soft text-fg font-semibold' : 'border-line bg-surface text-fg-2'
              }`}
            >
              <StoreBadge site={c.site} />
              <span className="flex flex-col items-start leading-tight">
                <span>{c.label}</span>
                <span className="num text-xs text-fg-3 font-normal">
                  {c.isReference || (c.result && c.result.status !== 'unavailable') ? formatPrice(c.total) : c.ready ? 'Unavailable' : 'Checking…'}
                </span>
              </span>
              {c.site === bestSite && <Trophy size={14} className="text-ok" aria-label="Best price" />}
            </button>
          );
        })}
      </div>

      <div id="cross-check-panel" role="tabpanel" className="flex flex-col gap-3">
        <div className={`card p-4 ${col.site === bestSite ? 'border-ok-line' : ''}`}>
          <ColumnHeader col={col} best={col.site === bestSite} budget={budget} />
          {col.result?.status === 'unavailable' && <p className="mt-2 text-sm text-fg-2">{col.result.error}</p>}
        </div>

        {col.result?.status !== 'unavailable' && (
          <ul className="flex flex-col gap-2">
            {rows.map((category) => {
              const Icon = CATEGORY_ICONS[category] || Box;
              const mine = columns[0].build?.[category];
              return (
                <li key={category} className="card p-3 flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
                    <Icon size={15} className="text-fg-3" aria-hidden="true" />
                    {category}
                  </span>
                  <PartCell col={col} category={category} refPart={mine} lowest={lowest[category] === col.site} />
                  {!col.isReference && mine && (
                    <p className="text-xs text-fg-3 line-clamp-1">
                      Yours: {mine.name} · <span className="num">{formatPrice(mine.price)}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-surface border-t border-line">
          <SwitchButton col={col} best={col.site === bestSite} stale={stale} onAdopt={onAdopt} />
        </div>
      </div>
    </div>
  );
}

/**
 * "Compare stores": the working build priced at every store, part by part. Columns fill in as each
 * store finishes; a store can be made the working build in one click (undoable).
 */
export default function CrossCheckDialog({ open, onClose, isNarrow, check, referenceSite, build, budget, onRun, onAdopt }) {
  const dialogRef = useDialogFocus(open, onClose);
  const { sheetProps, handleProps } = useSheetDrag(isNarrow, onClose);
  const { columns, rows, bestSite, data } = useColumns({ check, referenceSite, build });
  const headline = data && !check.stale ? crossCheckHeadline(data) : '';
  const saving = data ? bestStore(data).saving : 0;
  const checkedAt = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

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
            <div {...handleProps} className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-1 sm:pt-5 pb-3 border-b border-line">
              <div className="min-w-0">
                <h2 id="cross-check-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
                  <Columns3 size={18} className="text-accent" aria-hidden="true" />
                  Compare stores
                </h2>
                <p id="cross-check-lead" className="mt-1 text-sm text-fg-2">
                  Your build priced at every store: the same part where they have it, the closest equivalent where they don't.
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="btn btn-icon shrink-0">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
              {check.stale && check.status !== 'running' && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm" role="status">
                  <AlertTriangle size={16} className="text-warn shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-[12rem] text-fg">Your build changed after this check, so these prices are for the earlier build.</span>
                  <button type="button" onClick={onRun} className="btn">
                    <RefreshCw size={14} aria-hidden="true" /> Check again
                  </button>
                </div>
              )}

              {check.status === 'error' && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-bad-line bg-bad-soft px-4 py-3 text-sm">
                  <span className="flex-1 min-w-[12rem] text-fg">{check.error}</span>
                  <button type="button" onClick={onRun} className="btn">
                    <RefreshCw size={14} aria-hidden="true" /> Try again
                  </button>
                </div>
              )}

              {headline && (
                <m.p
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring.smooth, opacity: tween.base }}
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium text-fg ${
                    saving > 0 ? 'border-ok-line bg-ok-soft' : 'border-line bg-surface-2'
                  }`}
                  role="status"
                >
                  {saving > 0
                    ? <Trophy size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />
                    : <Check size={16} className="text-fg-2 shrink-0 mt-0.5" aria-hidden="true" />}
                  {headline}
                </m.p>
              )}

              {check.status !== 'error' && (isNarrow ? (
                <CompareTabs columns={columns} rows={rows} bestSite={bestSite} budget={budget} stale={check.stale} onAdopt={onAdopt} />
              ) : (
                <CompareTable columns={columns} rows={rows} bestSite={bestSite} budget={budget} stale={check.stale} onAdopt={onAdopt} />
              ))}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
              <Legend />
              <div className="flex items-center gap-3 text-xs text-fg-3">
                {checkedAt && <span>Prices checked at {checkedAt}</span>}
                {check.status === 'done' && !check.stale && (
                  <button type="button" onClick={onRun} className="btn">
                    <RefreshCw size={14} aria-hidden="true" /> Check again
                  </button>
                )}
              </div>
            </div>
          </m.section>
        </m.div>
      )}
    </AnimatePresence>
  );
}
