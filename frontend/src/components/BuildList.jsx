import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Flame, Layers, Monitor, ChevronRight } from 'lucide-react';
import {
  CORE_CATEGORIES, PLATFORM_CATEGORIES, PERIPHERAL_CATEGORIES,
  REQUIRED_CATEGORIES, CATEGORY_DEPENDENCIES,
} from '../lib/constants';
import PartRow, { SkeletonRow } from './PartRow';

const SECTIONS = [
  { key: 'core', title: 'Core', hint: 'Sets platform and power needs', icon: Flame, accent: true, categories: CORE_CATEGORIES },
  { key: 'platform', title: 'Platform', hint: 'Board, memory, storage, power, cooling, case', icon: Layers, categories: PLATFORM_CATEGORIES },
  { key: 'peripherals', title: 'Peripherals', hint: 'Monitor, mouse, keyboard, UPS', icon: Monitor, categories: PERIPHERAL_CATEGORIES, optional: true },
];

/**
 * @param {boolean} refining - a build already exists and a refine is what is running
 * @param {string[]|null|undefined} changing - parts being searched again: undefined = not known yet,
 *   null = all of them. Only those rows show loading; the rest stay on screen as kept.
 * @param {Object} [changes] - category -> {before, after, delta} from the last refine
 */
export default function BuildList({ build, hideEmpty, isBusy, refining = false, changing, changes, onRemove, onSwap }) {
  // Optional group: collapsed until something in it is chosen, unless the user toggles it.
  const [optionalOpen, setOptionalOpen] = useState(null);

  // Running index across sections drives the 30ms entrance stagger.
  let rowIndex = 0;

  // A fresh build is all new. A refine only loads the rows it is searching again.
  const isLoadingRow = (category) => {
    if (!isBusy) return false;
    if (!refining || changing === null) return true;
    if (changing === undefined) return false; // still reading the message: leave the parts as they are
    return changing.includes(category);
  };
  const isKeptRow = (category) => isBusy && refining && Array.isArray(changing)
    && !changing.includes(category) && Boolean(build[category]);

  return (
    <>
      {SECTIONS.map(({ key, title, hint, icon: Icon, accent, categories, optional }) => {
        const hasAny = categories.some((c) => build[c]);
        const open = optional ? (optionalOpen ?? hasAny) : true;
        const panelId = `section-${key}`;

        return (
          <section key={key} aria-label={title}>
            <div className="flex items-center justify-between mb-2 px-1">
              {optional ? (
                <button
                  type="button"
                  onClick={() => setOptionalOpen(!open)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-sm font-semibold text-fg hover:bg-surface-2"
                >
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={`text-fg-3 transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                  <span>{title}</span>
                  <span className="text-xs font-normal text-fg-3">
                    {categories.length} optional
                  </span>
                </button>
              ) : (
                <h3 className={`flex items-center gap-2 text-sm font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>
                  <Icon size={14} aria-hidden="true" />
                  <span>{title}</span>
                </h3>
              )}
              <span className="text-xs text-fg-3 hidden sm:inline">{hint}</span>
            </div>

            {open && (
              <div id={panelId} className="space-y-2">
                <AnimatePresence>
                  {categories.map((category) => {
                    if (isLoadingRow(category)) {
                      return <SkeletonRow key={`skel-${category}`} label={refining && changing ? category : undefined} />;
                    }
                    const item = build[category];
                    if (hideEmpty && !item) return null;
                    const index = rowIndex++;
                    return (
                      <PartRow
                        key={category}
                        category={category}
                        item={item}
                        isRequired={REQUIRED_CATEGORIES.has(category)}
                        dependency={CATEGORY_DEPENDENCIES[category]}
                        isCore={key === 'core'}
                        kept={isKeptRow(category)}
                        change={changes?.[category] || null}
                        index={index}
                        onRemove={onRemove}
                        onSwap={onSwap}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
