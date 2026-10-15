import { AnimatePresence } from 'framer-motion';
import { Flame, Layers, Monitor } from 'lucide-react';
import {
  CORE_CATEGORIES, PLATFORM_CATEGORIES, PERIPHERAL_CATEGORIES,
  REQUIRED_CATEGORIES, CATEGORY_DEPENDENCIES,
} from '../lib/constants';
import PartRow, { SkeletonRow } from './PartRow';

const SECTIONS = [
  { key: 'core', title: 'Core', hint: 'Sets platform and power needs', icon: Flame, accent: true, categories: CORE_CATEGORIES },
  { key: 'platform', title: 'Platform', hint: 'Board, memory, storage, power, cooling, case', icon: Layers, categories: PLATFORM_CATEGORIES },
  { key: 'peripherals', title: 'Peripherals', hint: 'Monitor, mouse, keyboard, UPS', icon: Monitor, categories: PERIPHERAL_CATEGORIES },
];

export default function BuildList({ build, hideEmpty, isBusy, onRemove }) {
  return (
    <>
      {SECTIONS.map(({ key, title, hint, icon: Icon, accent, categories }) => (
        <section key={key} aria-label={title}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className={`flex items-center gap-2 text-sm font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>
              <Icon size={14} aria-hidden="true" />
              <span>{title}</span>
            </h3>
            <span className="text-xs text-fg-3 hidden sm:inline">{hint}</span>
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {categories.map((category) => {
                if (isBusy) return <SkeletonRow key={`skel-${category}`} />;
                const item = build[category];
                if (hideEmpty && !item) return null;
                return (
                  <PartRow
                    key={category}
                    category={category}
                    item={item}
                    isRequired={REQUIRED_CATEGORIES.has(category)}
                    dependency={CATEGORY_DEPENDENCIES[category]}
                    isCore={key === 'core'}
                    onRemove={onRemove}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </>
  );
}
