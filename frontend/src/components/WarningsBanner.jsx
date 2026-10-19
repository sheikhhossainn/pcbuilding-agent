import { ShieldAlert, PackageMinus, SlidersHorizontal, Info, Box } from 'lucide-react';
import { CATEGORY_ICONS } from '../lib/constants';
import { renderBold } from '../lib/renderBold';
import { parseWarnings } from '../lib/warnings';

/**
 * Concise, Mac-style warnings card:
 * - Summarizes what has been left out and why in a single clean view.
 * - Interactive chips let the user jump directly to omitted parts.
 * - Suppresses redundant degradation lines for omitted components.
 */
export default function WarningsBanner({ warnings, onFocusPart }) {
  if (!warnings || warnings.length === 0) return null;

  const {
    incompatibles,
    leftOutCategories,
    leftOutReason,
    adjustments,
    otherNotes,
  } = parseWarnings(warnings);

  const hasOmissions = leftOutCategories.length > 0;
  const hasAdjustments = adjustments.length > 0;
  const hasOtherNotes = otherNotes.length > 0;
  const hasSummaryCard = hasOmissions || hasAdjustments || hasOtherNotes;

  return (
    <div role="alert" className="space-y-3">
      {/* 1. Critical compatibility errors */}
      {incompatibles.map((warning, i) => (
        <div
          key={`incomp-${i}`}
          className="flex items-start gap-2.5 rounded-xl border border-bad-line bg-bad-soft p-3.5 text-sm text-bad leading-relaxed"
        >
          <ShieldAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <span>{renderBold(warning)}</span>
        </div>
      ))}

      {/* 2. Consolidated Build Summary Card */}
      {hasSummaryCard && (
        <div className="rounded-xl border border-line bg-surface/90 shadow-sm p-4 text-sm leading-relaxed backdrop-blur-md">
          {/* Left-out components section */}
          {hasOmissions && (
            <div>
              <div className="flex items-start gap-2.5">
                <PackageMinus className="mt-0.5 shrink-0 text-warn" size={16} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">
                      {leftOutReason === 'budget'
                        ? 'Left out to stay within your budget'
                        : 'Omitted from this build'}
                    </span>
                    <span className="text-xs text-fg-3">
                      ({leftOutCategories.length} {leftOutCategories.length === 1 ? 'part' : 'parts'})
                    </span>
                  </div>

                  {/* Part chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {leftOutCategories.map((category) => {
                      const Icon = CATEGORY_ICONS[category] || Box;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => onFocusPart?.(category)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 border border-line-strong text-xs font-medium text-fg hover:border-accent hover:text-accent transition-colors cursor-pointer group"
                          title={`View ${category} in parts list`}
                        >
                          <Icon size={13} className="text-fg-3 group-hover:text-accent transition-colors shrink-0" />
                          <span>{category}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-fg-3 mt-2 leading-normal">
                    {leftOutReason === 'budget'
                      ? 'Omitted to fit core PC parts within your budget. Click a part to view it below, or add it back anytime.'
                      : 'Not tracked in the selected retailer catalog. You can source it separately or add an alternative.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Adjustments section */}
          {hasAdjustments && (
            <div className={hasOmissions ? 'mt-3.5 pt-3.5 border-t border-line/60' : ''}>
              <div className="flex items-start gap-2.5">
                <SlidersHorizontal className="mt-0.5 shrink-0 text-fg-3" size={15} aria-hidden="true" />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-semibold text-fg">Adjusted for budget:</span>
                  <ul className="mt-1 space-y-1 text-fg-2">
                    {adjustments.map((adj, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-fg-3 shrink-0">•</span>
                        <span>{renderBold(adj)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* General advisory notes */}
          {hasOtherNotes && (
            <div className={hasOmissions || hasAdjustments ? 'mt-3.5 pt-3.5 border-t border-line/60' : ''}>
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 shrink-0 text-accent" size={15} aria-hidden="true" />
                <div className="flex-1 min-w-0 text-xs space-y-1 text-fg-2">
                  {otherNotes.map((note, i) => (
                    <p key={i}>{renderBold(note)}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
