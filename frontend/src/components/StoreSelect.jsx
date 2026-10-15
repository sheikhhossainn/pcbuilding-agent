import { SITE_OPTIONS } from '../lib/constants';

export default function StoreSelect({
  id, value, onChange, customUrl, onCustomUrlChange, disabled = false, label = 'Store', className = '',
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs text-fg-3 shrink-0">{label}</label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-h-9 flex-1 bg-surface border border-line rounded-lg px-2.5 text-sm font-medium text-fg cursor-pointer disabled:opacity-50"
        >
          {SITE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      {value === 'custom' && (
        <input
          type="text"
          inputMode="url"
          placeholder="https://retailer.com"
          value={customUrl}
          onChange={(e) => onCustomUrlChange(e.target.value)}
          aria-label="Custom retailer URL"
          className="mt-2 w-full min-h-9 bg-surface border border-line rounded-lg px-3 text-sm text-fg placeholder:text-fg-3"
        />
      )}
    </div>
  );
}
