import { ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatPrice } from '../lib/format';
import { TOTAL_PARTS } from '../lib/constants';
import StatusChip from './StatusChip';
import AnimatedPrice from './AnimatedPrice';

// Phone-only. Keeps total, budget and compatibility in view while scrolling.
export default function MobileSummaryBar({
  total, budget, configuredCount, incompatibleCount, noteCount, onClick,
}) {
  if (configuredCount === 0) return null;

  const isOver = budget > 0 && total > budget;
  const budgetPct = budget > 0 ? Math.round((total / budget) * 100) : 0;

  let subtitle = `${configuredCount} of ${TOTAL_PARTS} parts`;
  if (budget > 0) {
    subtitle = isOver
      ? `${formatPrice(total - budget)} over ${formatPrice(budget)} budget`
      : `${budgetPct}% of ${formatPrice(budget)} budget`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Build summary: ${formatPrice(total)}. Tap for details.`}
      className="lg:hidden tactile-btn w-full mt-2 card px-4 py-2 min-h-14 flex items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block num font-bold text-lg text-fg leading-tight">
          <AnimatedPrice value={total} />
        </span>
        <span className={`block text-xs truncate ${isOver ? 'text-bad' : 'text-fg-3'}`}>{subtitle}</span>
      </span>
      {incompatibleCount > 0 ? (
        <StatusChip tone="bad" icon={ShieldAlert} className="shrink-0">{incompatibleCount} incompatible</StatusChip>
      ) : noteCount > 0 ? (
        <StatusChip tone="warn" icon={AlertTriangle} className="shrink-0">
          {noteCount} {noteCount === 1 ? 'note' : 'notes'}
        </StatusChip>
      ) : (
        <StatusChip tone="ok" icon={CheckCircle2} className="shrink-0">No issues</StatusChip>
      )}
    </button>
  );
}
