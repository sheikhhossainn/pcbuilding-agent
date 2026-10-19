import { useState, useEffect } from 'react';
import axios from 'axios';
import { m, AnimatePresence } from 'framer-motion';
import { backdrop, sheet } from '../lib/motion';
import { X, Box, RefreshCw } from 'lucide-react';
import { CATEGORY_ICONS, SITE_OPTIONS } from '../lib/constants';
import { formatPrice } from '../lib/format';
import { getSpecChips } from '../lib/telemetry';
import { describeFreshness } from '../lib/time';
import { useDialogFocus } from '../hooks/useDialogFocus';
import PartImage from './PartImage';

const EMPTY = { key: null, items: [], error: '' };

const toPartsPayload = (build) =>
  Object.fromEntries(
    Object.entries(build)
      .filter(([, item]) => item)
      .map(([category, item]) => [category, { name: item.name, price: item.price, url: item.url || null }])
  );

function DeltaLabel({ delta }) {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) return <span className="text-xs text-fg-3">Same price</span>;
  const cheaper = delta < 0;
  return (
    <span className={`num text-xs font-medium ${cheaper ? 'text-ok' : 'text-fg-2'}`}>
      {cheaper ? '−' : '+'}{formatPrice(Math.abs(delta))}
    </span>
  );
}

/**
 * Side sheet (bottom sheet on phones) listing in-stock parts for one category that
 * stay compatible with the rest of the build, nearest in price first.
 */
export default function SwapDrawer({ category, current, site, build, intent, isNarrow, onClose, onPick }) {
  const open = Boolean(category);
  const dialogRef = useDialogFocus(open, onClose);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(EMPTY);

  const requestKey = open ? `${category}|${site}|${attempt}` : null;
  const loading = open && result.key !== requestKey;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

  useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();

    axios.post(`${apiBaseUrl}/api/parts/alternatives`, {
      category,
      site,
      build: toPartsPayload(build),
      intent: { use_case: intent?.use_case, budget_bdt: intent?.budget_bdt },
      limit: 10,
    }, { signal: controller.signal })
      .then(({ data }) => {
        setResult({ key: requestKey, items: data.alternatives || [], error: '' });
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setResult({
          key: requestKey,
          items: [],
          error: err.response?.data?.error || "Couldn't load alternatives. Check your connection and try again.",
        });
      });

    return () => {
      controller.abort();
      setResult(EMPTY);
    };
    // `build` and `intent` are read once per opening on purpose: the list should not
    // reshuffle underneath the user while they choose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, apiBaseUrl]);

  const Icon = CATEGORY_ICONS[category] || Box;
  const siteLabel = SITE_OPTIONS.find((s) => s.value === site)?.label || site;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="swap-backdrop"
          {...backdrop}
          className="fixed inset-0 z-50 bg-[var(--scrim)] print:hidden"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <m.aside
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-title"
            tabIndex={-1}
            {...sheet(isNarrow)}
            className="surface-float absolute bg-surface border-line flex flex-col
              inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
              sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-t-0 sm:border-l"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
              <div className="min-w-0">
                <h2 id="swap-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
                  <Icon size={18} className="text-fg-3" aria-hidden="true" />
                  Swap {category}
                </h2>
                {current && (
                  <p className="mt-1 text-sm text-fg-2 line-clamp-2">
                    Now: {current.name} · <span className="num">{formatPrice(current.price)}</span>
                  </p>
                )}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="btn btn-icon shrink-0">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {loading && (
                <div className="space-y-2" aria-busy="true" aria-label="Loading alternatives">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="card p-3 flex gap-3 animate-pulse">
                      <div className="w-11 h-11 rounded-lg bg-surface-2 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-surface-2" />
                        <div className="h-3 w-1/3 rounded bg-surface-2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && result.error && (
                <div role="alert" className="card p-4 text-sm text-fg-2">
                  <p>{result.error}</p>
                  <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn btn-touch mt-3">
                    <RefreshCw size={14} aria-hidden="true" /> Try again
                  </button>
                </div>
              )}

              {!loading && !result.error && result.items.length === 0 && (
                <p className="card p-4 text-sm text-fg-2">
                  No other in-stock {category.toLowerCase()} at {siteLabel} fits the rest of this build.
                  Try removing the part and asking the AI for something specific.
                </p>
              )}

              {!loading && result.items.length > 0 && (
                <ul className="space-y-2">
                  {result.items.map((part) => {
                    const chips = getSpecChips(category, part);
                    const freshness = describeFreshness(part.updatedAt);
                    return (
                      <li key={part.url || part.name}>
                        <button
                          type="button"
                          onClick={() => onPick(part)}
                          className="tactile-btn card w-full p-3 flex items-start gap-3 text-left hover:bg-surface-2 hover:border-line-strong"
                        >
                          <PartImage
                            src={part.image}
                            className="w-11 h-11 object-contain rounded-lg bg-white p-0.5 border border-line shrink-0"
                            fallback={(
                              <span className="w-11 h-11 rounded-lg bg-surface-2 text-fg-2 flex items-center justify-center shrink-0" aria-hidden="true">
                                <Icon size={20} strokeWidth={1.5} />
                              </span>
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-fg leading-snug line-clamp-2">{part.name}</span>
                            {chips.length > 0 && (
                              <span className="mt-1.5 flex flex-wrap gap-1.5">
                                {chips.map((chip) => <span key={chip} className="spec-tag">{chip}</span>)}
                              </span>
                            )}
                            {freshness && (
                              <span className={`mt-1 block text-xs ${freshness.stale ? 'text-warn' : 'text-fg-3'}`}>
                                {freshness.label}{freshness.stale ? ' — price may have changed' : ''}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block num text-sm font-semibold text-fg">{formatPrice(part.price)}</span>
                            <DeltaLabel delta={part.delta} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="px-5 py-3 border-t border-line text-xs text-fg-3">
              In stock at {siteLabel} and compatible with your CPU, board, memory and PSU.
            </p>
          </m.aside>
        </m.div>
      )}
    </AnimatePresence>
  );
}
