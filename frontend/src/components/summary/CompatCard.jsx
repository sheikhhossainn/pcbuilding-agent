import { CircleHelp, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Status comes from the engine's actual warnings; nothing is claimed that wasn't checked.
export default function CompatCard({ configuredCount, incompatibleCount, noteCount }) {
  let content;

  if (configuredCount === 0) {
    content = (
      <div className="flex items-start gap-2 text-sm text-fg-3">
        <CircleHelp size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>Not checked yet. Build a PC to see results.</span>
      </div>
    );
  } else if (incompatibleCount > 0) {
    content = (
      <div className="flex items-start gap-2 text-sm text-bad">
        <ShieldAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {incompatibleCount} incompatible {incompatibleCount === 1 ? 'part' : 'parts'}
          {noteCount > 0 && ` and ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`}. See details above the parts list.
        </span>
      </div>
    );
  } else if (noteCount > 0) {
    content = (
      <div className="flex items-start gap-2 text-sm text-warn">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>{noteCount} {noteCount === 1 ? 'note' : 'notes'} to review. See details above the parts list.</span>
      </div>
    );
  } else {
    content = (
      <div className="flex items-start gap-2 text-sm text-fg">
        <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-ok" aria-hidden="true" />
        <span>No compatibility issues found.</span>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-fg mb-3">Compatibility</h3>
      {content}
    </div>
  );
}
