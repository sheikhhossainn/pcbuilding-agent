import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { PROMPT_MODIFIERS } from '../lib/constants';
import { useDismiss } from '../hooks/useDismiss';

// "+" button that opens a short list of prompt add-ons (CPU brand, GPU, RAM...).
export default function ModifiersMenu({ onPick, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add a preference to your request"
        title="Add a preference"
        className="btn btn-icon"
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" className={`transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full left-0 mb-2 z-50 w-56 card surface-float p-1">
          <p className="px-3 pt-2 pb-1 text-xs font-medium text-fg-3">Add to your request</p>
          {PROMPT_MODIFIERS.map((mod) => (
            <button
              key={mod.label}
              type="button"
              role="menuitem"
              onClick={() => { onPick(mod.append); setOpen(false); }}
              className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-fg hover:bg-surface-2"
            >
              {mod.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
