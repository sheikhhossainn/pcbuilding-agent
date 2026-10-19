import { m } from 'framer-motion';
import { fadeIn } from '../lib/motion';
import { AlertCircle, AlertTriangle, HelpCircle, X } from 'lucide-react';

const TONES = {
  warn: { box: 'bg-warn-soft border-warn-line text-fg', icon: 'text-warn', Icon: AlertTriangle },
  bad: { box: 'bg-bad-soft border-bad-line text-fg', icon: 'text-bad', Icon: AlertCircle },
  info: { box: 'bg-accent-soft border-accent-line text-fg', icon: 'text-accent', Icon: HelpCircle },
};

// Dismissible inline banner for traffic warnings and request errors.
export default function Notice({ tone = 'warn', role, onDismiss, children }) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <m.div
      role={role}
      {...fadeIn(-6)}
      className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed ${box}`}
    >
      <Icon className={`mt-0.5 shrink-0 ${icon}`} size={18} aria-hidden="true" />
      <div className="flex-1 min-w-0">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-2 w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-fg-2 hover:text-fg hover:bg-surface-2"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </m.div>
  );
}
