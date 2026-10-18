/**
 * How a refine message was understood, as short chips the user can check:
 * "Monitor: around ৳20,000" "PSU: better, gets the saved money".
 *
 * @param {Array<{label: string, text: string}>|null} items
 * @param {string} label - lead-in text, e.g. "Understood"
 * @param {boolean} [live] - announce when the chips appear (shown while a refine is running)
 */
export default function InterpretationChips({ items, label, live = false, className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}
      {...(live ? { role: 'status' } : {})}
    >
      <span className="text-fg-3">{label}:</span>
      {items.map((item) => (
        <span key={`${item.label}:${item.text}`} className="chip bg-accent-soft border-accent-line text-fg">
          <span className="font-medium">{item.label}</span>
          <span className="text-fg-2">{item.text}</span>
        </span>
      ))}
    </div>
  );
}
