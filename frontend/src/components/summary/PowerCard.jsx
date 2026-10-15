import { Zap } from 'lucide-react';
import StatusChip from '../StatusChip';

const STATUS = {
  optimal: { tone: 'ok', label: 'Good headroom' },
  headroom: { tone: 'warn', label: 'Tight' },
  warning: { tone: 'bad', label: 'Too tight' },
};

export default function PowerCard({ telemetry }) {
  const { estimatedDraw, recommendedPsu, installedPsu, psuRatio, psuStatus, loadPct } = telemetry;
  const status = STATUS[psuStatus];
  const barTone = loadPct > 85 ? 'bg-bad' : loadPct > 65 ? 'bg-warn' : 'bg-ok';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Zap size={14} className="text-fg-3" aria-hidden="true" /> Power
        </h3>
        {installedPsu > 0 && status && <StatusChip tone={status.tone}>{status.label}</StatusChip>}
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-fg-2">Estimated draw</span>
          <span className="num font-semibold text-fg">~{estimatedDraw}W</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-fg-2">Recommended PSU</span>
          <span className="num font-semibold text-accent">{recommendedPsu}W+</span>
        </div>
        {installedPsu > 0 && (
          <div className="flex justify-between items-baseline pt-2 border-t border-line">
            <span className="text-fg-2">Your PSU</span>
            <span className="num font-semibold text-fg">{installedPsu}W ({psuRatio}% load)</span>
          </div>
        )}

        <div
          className="w-full bg-surface-2 h-2 rounded-full overflow-hidden"
          role="progressbar"
          aria-label="Estimated power load"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={loadPct}
        >
          <div className={`h-full rounded-full transition-[width] duration-500 ${barTone}`} style={{ width: `${loadPct}%` }} />
        </div>
      </div>
    </div>
  );
}
