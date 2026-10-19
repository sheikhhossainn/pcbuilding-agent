import { Copy, FileDown, Link2 } from 'lucide-react';
import TotalCard from './summary/TotalCard';
import PowerCard from './summary/PowerCard';
import BudgetSplitCard from './summary/BudgetSplitCard';
import CompatCard from './summary/CompatCard';
import VersionsCard from './summary/VersionsCard';
import CrossCheckCard from './summary/CrossCheckCard';

export default function SummaryRail({
  telemetry, total, budget, onCopy, onShare, onExport,
  versions, currentVersionId, onRestoreVersion, busy = false,
  crossCheck, onCrossCheck, crossCheckDisabledReason = '',
  crossCheckHighlight = false,
}) {
  return (
    <div id="summary-rail" className="lg:col-span-4 space-y-4 lg:sticky lg:top-24 scroll-mt-40">
      <TotalCard total={total} configuredCount={telemetry.configuredCount} budget={budget} />
      {telemetry.configuredCount > 0 && crossCheck && (
        <CrossCheckCard
          check={crossCheck}
          onOpen={onCrossCheck}
          disabled={busy || Boolean(crossCheckDisabledReason)}
          disabledReason={crossCheckDisabledReason}
          highlight={crossCheckHighlight}
        />
      )}
      <CompatCard
        configuredCount={telemetry.configuredCount}
        incompatibleCount={telemetry.incompatibleCount}
        noteCount={telemetry.noteCount}
      />
      {telemetry.configuredCount > 0 && <PowerCard telemetry={telemetry} />}
      <VersionsCard
        versions={versions}
        currentVersionId={currentVersionId}
        onRestore={onRestoreVersion}
        disabled={busy}
      />
      {total > 0 && <BudgetSplitCard telemetry={telemetry} />}

      <div className="grid grid-cols-2 gap-2.5 print:hidden">
        <button type="button" onClick={onShare} className="btn btn-touch col-span-2 btn-primary">
          <Link2 size={14} aria-hidden="true" />
          <span>Copy share link</span>
        </button>
        <button type="button" onClick={onCopy} className="btn btn-touch">
          <Copy size={14} aria-hidden="true" />
          <span>Copy summary</span>
        </button>
        <button type="button" onClick={onExport} className="btn btn-touch">
          <FileDown size={14} aria-hidden="true" />
          <span>Print PDF</span>
        </button>
      </div>
    </div>
  );
}
