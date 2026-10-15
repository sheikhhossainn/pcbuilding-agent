import { useRef, useState } from 'react';
import { MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import { useDismiss } from '../hooks/useDismiss';

// Phone-only overflow menu for a part row (desktop shows inline icon buttons).
export default function RowMenu({ category, url, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${category}`}
        className="btn btn-icon"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-52 card surface-float p-1">
          {url && (
            <a
              role="menuitem"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 min-h-11 px-3 rounded-lg text-sm text-fg hover:bg-surface-2"
            >
              <ExternalLink size={16} aria-hidden="true" />
              View on retailer
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onRemove(category); }}
            className="w-full flex items-center gap-2.5 min-h-11 px-3 rounded-lg text-sm text-bad hover:bg-bad-soft"
          >
            <Trash2 size={16} aria-hidden="true" />
            Remove {category}
          </button>
        </div>
      )}
    </div>
  );
}
