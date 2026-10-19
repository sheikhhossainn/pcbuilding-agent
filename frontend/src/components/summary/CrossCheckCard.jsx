import StoreSearchIcon from '../icons/StoreSearchIcon';
import { Trophy, ChevronRight, Loader2 } from 'lucide-react';
import { formatPrice } from '../../lib/format';
import { bestStore, otherStoresText } from '../../lib/crossCheck';
import { SITE_OPTIONS } from '../../lib/constants';

/**
 * Entry point to "Compare stores" in the summary rail. Once a check has run for this build it
 * shows the answer (where it is cheapest) so the user does not have to open the dialog again.
 */
export default function CrossCheckCard({ check, onOpen, disabled, disabledReason, highlight = false, site }) {
  const fresh = check.status === 'done' && !check.stale ? check.data : null;
  const { cheapest, saving } = bestStore(fresh);
  const running = check.status === 'running';

  let detail = `See this build at ${otherStoresText(SITE_OPTIONS, site)}.`;
  if (disabled && disabledReason) detail = disabledReason;
  else if (running) detail = 'Checking the other stores…';
  else if (fresh && cheapest && saving > 0) detail = `${formatPrice(saving)} less at ${cheapest.label}.`;
  else if (fresh && cheapest) detail = `${fresh.reference.label} is the cheapest for this build.`;
  else if (fresh) detail = 'No other store has every part right now.';

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
      className={`tactile-btn card w-full p-4 flex items-center gap-3 text-left hover:bg-surface-2 hover:border-line-strong disabled:opacity-60 disabled:cursor-not-allowed print:hidden ${highlight ? 'nudge' : ''}`}
    >
      <span
        className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border ${
          fresh && saving > 0 ? 'bg-ok-soft border-ok-line text-ok' : 'bg-accent-soft border-accent-line text-accent'
        }`}
        aria-hidden="true"
      >
        {running
          ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
          : fresh && saving > 0 ? <Trophy size={18} /> : <StoreSearchIcon size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">Compare stores</span>
        <span className="block text-xs text-fg-2 mt-0.5">{detail}</span>
      </span>
      <ChevronRight size={16} className="text-fg-3 shrink-0" aria-hidden="true" />
    </button>
  );
}
