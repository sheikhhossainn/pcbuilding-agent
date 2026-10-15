import { ShieldCheck } from 'lucide-react';
import { formatPrice } from '../../lib/format';
import { TOTAL_PARTS } from '../../lib/constants';
import AnimatedPrice from '../AnimatedPrice';

export default function TotalCard({ total, configuredCount, budget }) {
  const hasBudget = budget > 0;
  const isOver = hasBudget && total > budget;
  const pct = hasBudget ? Math.min(100, Math.round((total / budget) * 100)) : 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-xs text-fg-3 mb-2">
        <span>Total</span>
        <span className="flex items-center gap-1">
          <ShieldCheck size={14} className="text-ok" aria-hidden="true" /> Live prices
        </span>
      </div>
      <div className="num font-bold text-3xl sm:text-4xl text-fg tracking-tight">
        <AnimatedPrice value={total} />
      </div>

      {hasBudget && (
        <div className="mt-3">
          <div
            className="h-2 rounded-full bg-surface-2 overflow-hidden"
            role="progressbar"
            aria-label="Share of budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${isOver ? 'bg-bad' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={`mt-1.5 text-xs ${isOver ? 'text-bad' : 'text-fg-3'}`}>
            {isOver
              ? `${formatPrice(total - budget)} over your ${formatPrice(budget)} budget`
              : `${Math.round((total / budget) * 100)}% of your ${formatPrice(budget)} budget`}
          </div>
        </div>
      )}

      <div className="text-sm text-fg-2 mt-3 flex items-center justify-between pt-3 border-t border-line">
        <span>Parts selected</span>
        <span className="num text-fg font-medium">{configuredCount} of {TOTAL_PARTS}</span>
      </div>
    </div>
  );
}
