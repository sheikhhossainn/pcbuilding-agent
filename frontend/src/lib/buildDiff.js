import { formatPrice } from './format.js';

const sameName = (a, b) => String(a?.name || '').trim() === String(b?.name || '').trim();

/**
 * What a refine changed. Parts are compared by name: a kept part whose price moved is still kept.
 *
 * @param {Object} before - category -> part|null, the build before the refine
 * @param {Object} after - category -> part|null, the build the refine returned
 * @param {string[]} [order] - category order for the result
 * @returns {{ changed: Array<{category: string, before: object|null, after: object|null, delta: number}>,
 *             kept: string[], totalDelta: number }}
 */
export function diffBuilds(before, after, order = []) {
  const categories = [...new Set([...order, ...Object.keys(before || {}), ...Object.keys(after || {})])];
  const changed = [];
  const kept = [];

  for (const category of categories) {
    const b = before?.[category] || null;
    const a = after?.[category] || null;
    if (!b && !a) continue;
    if (b && a && sameName(b, a)) {
      kept.push(category);
      continue;
    }
    changed.push({ category, before: b, after: a, delta: (a?.price || 0) - (b?.price || 0) });
  }

  return { changed, kept, totalDelta: changed.reduce((sum, c) => sum + c.delta, 0) };
}

/** Text color for a price change: cost up reads as a caution, cost down as a saving. */
export function deltaTone(delta) {
  if (delta > 0) return 'text-warn';
  if (delta < 0) return 'text-ok';
  return 'text-fg-3';
}

/** "+৳3,401", "−৳14,200", or "same price". */
export function formatDelta(delta) {
  if (!delta) return 'same price';
  return `${delta > 0 ? '+' : '−'}${formatPrice(Math.abs(delta))}`;
}
