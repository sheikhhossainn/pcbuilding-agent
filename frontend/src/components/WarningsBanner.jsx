import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { renderBold } from '../lib/renderBold';

// Engine warnings, shown above the parts list so they can't be missed.
export default function WarningsBanner({ warnings }) {
  if (warnings.length === 0) return null;

  return (
    <div role="alert" className="space-y-2">
      {warnings.map((warning, i) => {
        const isIncompatible = String(warning).includes('INCOMPATIBLE');
        const Icon = isIncompatible ? ShieldAlert : AlertTriangle;
        return (
          <div
            key={i}
            className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed ${
              isIncompatible
                ? 'bg-bad-soft border-bad-line text-bad'
                : 'bg-warn-soft border-warn-line text-warn'
            }`}
          >
            <Icon className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            <span>{renderBold(warning)}</span>
          </div>
        );
      })}
    </div>
  );
}
