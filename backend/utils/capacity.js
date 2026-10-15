/**
 * Capacity parsing from product names.
 * Shared by the repository (strategy matching) and the build validator (post-checks) so both
 * agree on what a listing's size is.
 */

/**
 * Total RAM capacity in GB. Understands kits ("2x8GB", "8GBx2", "(8GB*2)") and bare sizes
 * ("16GB", "16G"). Model numbers that merely end in G ("SPECTRIX D45G") are not sizes.
 * @param {string} name
 * @returns {number} GB, or 0 when the name gives no capacity
 */
export function parseRamCapacityGb(name) {
  const n = String(name || '').toLowerCase();

  // "2x8gb", "2 x 8 gb", "2*16gb"
  const kitBefore = n.match(/(?:^|[^a-z0-9])(\d)\s*[x*]\s*(\d{1,3})\s*g(?:b)?\b/);
  if (kitBefore) return parseInt(kitBefore[1], 10) * parseInt(kitBefore[2], 10);

  // "8gbx2", "8gb x 2", "(16gb*2)"
  const kitAfter = n.match(/(?:^|[^a-z0-9])(\d{1,3})\s*g(?:b)?\s*[x*]\s*(\d)\b/);
  if (kitAfter) return parseInt(kitAfter[1], 10) * parseInt(kitAfter[2], 10);

  const gb = n.match(/(?:^|[^a-z0-9])(\d{1,3})\s*gb\b/);
  if (gb) return parseInt(gb[1], 10);

  const g = n.match(/(?:^|[^a-z0-9])(\d{1,3})\s*g\b/);
  if (g) return parseInt(g[1], 10);

  return 0;
}

/**
 * Storage capacity in GB (1TB = 1000). Sub-120 numbers are ignored: they are almost never a
 * drive size (cache sizes, speeds).
 * @param {string} name
 * @returns {number} GB, or 0 when unknown
 */
export function parseStorageCapacityGb(name) {
  const n = String(name || '').toLowerCase();
  const tb = n.match(/(\d+(?:\.\d+)?)\s*tb/);
  if (tb) return parseFloat(tb[1]) * 1000;
  const gb = n.match(/(\d+)\s*gb/);
  if (gb) {
    const value = parseInt(gb[1], 10);
    if (value >= 120) return value;
  }
  return 0;
}
