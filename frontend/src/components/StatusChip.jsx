const TONES = {
  ok: 'bg-ok-soft border-ok-line text-ok',
  warn: 'bg-warn-soft border-warn-line text-warn',
  bad: 'bg-bad-soft border-bad-line text-bad',
  accent: 'bg-accent-soft border-accent-line text-accent',
  neutral: 'bg-surface-2 border-line text-fg-2',
};

// Status is never color-only: always pass an icon and/or text.
export default function StatusChip({ tone = 'neutral', icon: Icon, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}
