import { useRef, useState, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { SITE_OPTIONS } from '../lib/constants';
import { useDismiss } from '../hooks/useDismiss';

function initials(label) {
  // "StarTech BD" -> ST, "CompMania BD" -> CM
  return (label.replace(/ BD$/, '').match(/[A-Z]/g) || [label[0]]).slice(0, 2).join('');
}

function Badge({ opt }) {
  return (
    <span
      className="w-7 h-7 shrink-0 rounded-md bg-accent-soft text-accent border border-accent-line flex items-center justify-center text-[11px] font-semibold"
      aria-hidden="true"
    >
      {opt.value === 'custom' ? <Globe size={14} strokeWidth={1.75} /> : initials(opt.label)}
    </span>
  );
}

// Retailer picker: a custom listbox so the open menu matches the app (a native
// <select> popup can't be themed). Keyboard: arrows, Home/End, Enter, Esc.
export default function StoreSelect({
  id, value, onChange, customUrl, onCustomUrlChange, disabled = false, label = 'Store', className = '',
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, SITE_OPTIONS.findIndex((o) => o.value === value));
  const selected = SITE_OPTIONS[selectedIndex];

  useDismiss(ref, open, () => setOpen(false));

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (opt) => {
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    const last = SITE_OPTIONS.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(SITE_OPTIONS[active]); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs text-fg-3 shrink-0">{label}</label>
        <div ref={ref} className="relative flex-1 min-w-[10rem]">
          <button
            id={id}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? `${listId}-${active}` : undefined}
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openMenu())}
            onKeyDown={onKeyDown}
            className="w-full min-h-9 pl-1.5 pr-2.5 flex items-center gap-2 rounded-lg border border-line bg-surface text-sm font-medium text-fg cursor-pointer hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Badge opt={selected} />
            <span className="flex-1 text-left truncate">{selected.label}</span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`text-fg-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence>
            {open && (
              <motion.ul
                id={listId}
                role="listbox"
                aria-label={label}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                style={{ transformOrigin: 'top' }}
                className="absolute left-0 right-0 top-full mt-2 z-50 min-w-[14rem] card surface-float p-1.5 m-0 list-none"
              >
                {SITE_OPTIONS.map((opt, i) => {
                  const isSelected = opt.value === value;
                  return (
                    <li
                      key={opt.value}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      onPointerEnter={() => setActive(i)}
                      onClick={() => choose(opt)}
                      className={`min-h-11 px-2 rounded-lg flex items-center gap-2.5 cursor-pointer text-sm ${
                        i === active ? 'bg-surface-2' : ''
                      } ${isSelected ? 'text-fg font-semibold' : 'text-fg-2 font-medium'}`}
                    >
                      <Badge opt={opt} />
                      <span className="flex-1 truncate">{opt.label}</span>
                      {isSelected && <Check size={16} strokeWidth={2} aria-hidden="true" className="text-accent shrink-0" />}
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
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
