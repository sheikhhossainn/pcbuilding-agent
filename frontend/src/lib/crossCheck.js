// Pure helpers for the store cross-check: what to send, what the result says, and how to word it.
import { formatPrice } from './format.js';

// Parts a build needs before it can be priced at other stores (the server checks the same).
export const CROSS_CHECK_REQUIRED = ['Processor', 'Motherboard', 'RAM', 'PSU'];

export const canCrossCheck = (build) => CROSS_CHECK_REQUIRED.every((c) => Boolean(build?.[c]));

/** What the server needs: names, prices and links only (specs are worked out server-side). */
export const toCrossCheckBuild = (build) => Object.fromEntries(
  Object.entries(build || {})
    .filter(([, item]) => item)
    .map(([category, item]) => [category, { name: item.name, price: item.price, url: item.url || null }])
);

/** Results are only valid for the exact build and store they were made for. */
export const crossCheckSignature = (build, site) => `${site}|${Object.entries(build || {})
  .filter(([, item]) => item)
  .map(([category, item]) => `${category}:${item.name}:${item.price}`)
  .join('|')}`;

// How a store's part relates to the one in the user's build. Never colour alone: each has a label.
export const MATCH_META = {
  exact: { label: 'Same part', tone: 'ok' },
  equivalent: { label: 'Equivalent', tone: 'accent' },
  substitute: { label: 'Substitute', tone: 'warn' },
  missing: { label: 'Not in stock', tone: 'bad' },
  added: { label: 'Added', tone: 'neutral' },
};

export const MATCH_HELP = {
  exact: 'The same model as in your build.',
  equivalent: 'A different brand or variant with the same key specs.',
  substitute: 'Nothing comparable in stock, so the builder picked the best fit for your budget.',
  missing: 'This store has nothing in stock for this part.',
  added: 'Needed by a part this store picked (for example a cooler for a hotter CPU).',
};

/** Parts in the user's build that a store's result covers, out of how many. */
export const partCount = (result) => {
  const counts = result?.counts || {};
  const total = (counts.exact || 0) + (counts.equivalent || 0) + (counts.substitute || 0) + (counts.missing || 0);
  return { same: counts.exact || 0, total };
};

/**
 * The store to point at: the cheapest one that can supply the whole build.
 * @returns {{ cheapest: object|null, saving: number, bestSite: string|null }} saving > 0 when it beats the user's store
 */
export function bestStore(data) {
  if (!data?.results) return { cheapest: null, saving: 0, bestSite: null };
  const complete = data.results.filter((r) => r.status === 'ok');
  const cheapest = complete.reduce((best, r) => (!best || r.total < best.total ? r : best), null);
  const saving = cheapest ? data.reference.total - cheapest.total : 0;

  // Determine which store actually has the lowest price overall:
  // If an external store beats the current store (saving > 0), it is the best site.
  // Otherwise, if the reference store has all parts in stock, the reference store itself is the best site.
  const refComplete = (data.reference?.outOfStock?.length || 0) === 0;
  const bestSite = (cheapest && saving > 0)
    ? cheapest.site
    : refComplete
    ? (data.reference?.site || null)
    : (cheapest?.site || null);

  return { cheapest, saving, bestSite };
}

/** One sentence that answers "should I buy this elsewhere?". */
export function crossCheckHeadline(data) {
  if (!data?.results) return '';
  const { cheapest, saving } = bestStore(data);
  const ref = data.reference;
  if (!cheapest) return `No other store has every part of this build in stock right now. ${ref.label} is your only complete option.`;
  const { same, total } = partCount(cheapest);
  const sameText = same === total ? 'every part is the same model' : `${same} of ${total} parts are the same model`;
  if (saving > 0) return `${cheapest.label} has this build for ${formatPrice(saving)} less, and ${sameText}.`;
  if (saving === 0) return `${cheapest.label} matches ${ref.label}'s price, and ${sameText}.`;
  return `${ref.label} is already the cheapest. Next best is ${cheapest.label}, ${formatPrice(-saving)} more.`;
}

/** The explanation shown after switching to a store's build. */
export function adoptedExplanation(result) {
  const c = result.counts || {};
  const parts = [
    c.exact && `${c.exact} ${c.exact === 1 ? 'part is' : 'parts are'} the same model`,
    c.equivalent && `${c.equivalent} ${c.equivalent === 1 ? 'is an equivalent' : 'are equivalents'}`,
    c.substitute && `${c.substitute} ${c.substitute === 1 ? 'was' : 'were'} substituted`,
    c.missing && `${c.missing} ${c.missing === 1 ? 'is' : 'are'} not in stock there`,
  ].filter(Boolean);
  return `Your build, priced at ${result.label}: ${new Intl.ListFormat('en', { type: 'conjunction' }).format(parts)}.`;
}
