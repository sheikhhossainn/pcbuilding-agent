const sentenceCase = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1);

/**
 * How a refine message was understood, as short chips the user can check:
 * "Monitor · Around ৳20,000" "PSU · Better, gets the saved money".
 *
 * @param {Array<{label: string, text: string}>|null} items
 * @param {string} label - lead-in text, e.g. "Understood as"
 * @param {boolean} [live] - announce when the chips appear (shown while a refine is running)
 */
export default function InterpretationChips({ items, label, live = false, className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}
      {...(live ? { role: 'status' } : {})}
    >
      <span className="text-fg-3 mr-0.5">{label}</span>
      {items.map((item) => (
        <span
          key={`${item.label}:${item.text}`}
          className="inline-flex items-center rounded-md border border-accent-line bg-accent-soft overflow-hidden"
        >
          <span className="px-2 py-0.5 text-fg-2 border-r border-accent-line">{item.label}</span>
          <span className="px-2 py-0.5 text-fg font-medium">{sentenceCase(item.text)}</span>
        </span>
      ))}
    </div>
  );
}
