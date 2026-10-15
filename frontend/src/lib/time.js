const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const STALE_AFTER_MS = 3 * DAY;

// SQLite CURRENT_TIMESTAMP values look like "2026-10-01 10:00:00" (UTC, no zone).
function parseTimestamp(value) {
  if (!value) return null;
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const time = Date.parse(withZone);
  return Number.isFinite(time) ? time : null;
}

/**
 * @returns {{ label: string, stale: boolean } | null}
 */
export function describeFreshness(updatedAt, now = Date.now()) {
  const time = parseTimestamp(updatedAt);
  if (time === null) return null;

  const age = Math.max(0, now - time);
  let label;
  if (age < HOUR) label = 'Updated just now';
  else if (age < DAY) label = `Updated ${Math.floor(age / HOUR)}h ago`;
  else label = `Updated ${Math.floor(age / DAY)}d ago`;

  return { label, stale: age >= STALE_AFTER_MS };
}
