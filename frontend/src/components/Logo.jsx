// Flat monogram: a "B" made of two stacked parts, like components racked in a case.
// One color, no gradient, legible at 16px. Keep in sync with public/favicon.svg.
const TOP = 'M16 11h9.5a5.75 5.75 0 0 1 0 11.5H16a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2Z';
const BOTTOM = 'M16 25.5h11a5.75 5.75 0 0 1 0 11.5H16a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z';

export function LogoMark({ size = 36, className = '', animated = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'logo-anim' : ''} ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="12" fill="#6366F1" />
      <path className="logo-part logo-part-a" d={TOP} fill="#fff" />
      <path className="logo-part logo-part-b" d={BOTTOM} fill="#fff" />
    </svg>
  );
}

/** Mark + wordmark. The wordmark inherits text color; "MyPC" takes the accent. */
export default function Logo({ size = 36, showWordmark = true, animated = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} animated={animated} />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight leading-none text-fg">
          Build<span className="text-accent">MyPC</span>
        </span>
      )}
    </span>
  );
}
