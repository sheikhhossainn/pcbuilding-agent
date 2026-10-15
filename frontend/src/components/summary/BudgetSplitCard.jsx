const SEGMENTS = [
  { key: 'gpuPct', label: 'Graphics', bar: 'bg-accent' },
  { key: 'cpuPct', label: 'Processor', bar: 'bg-accent/50' },
  { key: 'otherPct', label: 'Everything else', bar: 'bg-line-strong' },
];

export default function BudgetSplitCard({ telemetry }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-fg mb-3">Where the money goes</h3>

      <div className="w-full h-3 rounded-full overflow-hidden flex bg-surface-2 mb-3" aria-hidden="true">
        {SEGMENTS.map(({ key, bar }) => (
          <div key={key} style={{ width: `${telemetry[key]}%` }} className={`${bar} h-full`} />
        ))}
      </div>

      <ul className="space-y-1.5 text-sm">
        {SEGMENTS.map(({ key, label, bar }) => (
          <li key={key} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-fg-2">
              <span className={`w-2.5 h-2.5 rounded-sm ${bar}`} aria-hidden="true" />
              {label}
            </span>
            <span className="num font-medium text-fg">{telemetry[key]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
