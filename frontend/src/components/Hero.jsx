import { m } from 'framer-motion';
import { fadeIn, spring } from '../lib/motion';
import { PRESET_WORKLOADS } from '../lib/constants';
import Composer from './Composer';
import StoreSelect from './StoreSelect';

// Empty state: one prompt, five one-click starting points. No empty part cards.
// `ref` reaches the root so AnimatePresence (popLayout) can measure it on exit.
export default function Hero({
  ref,
  composerProps, onPickPreset,
  site, onSiteChange,
  heading = 'Build a PC for your budget',
  lead = 'Describe what you need. We match live prices from Bangladeshi retailers and check compatibility.',
}) {
  return (
    <m.section
      ref={ref}
      aria-label="Start a new build"
      {...fadeIn(8, spring.gentle)}
      className="max-w-2xl mx-auto pt-4 sm:pt-12"
    >
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg text-balance">
          {heading}
        </h1>
        <p className="mt-3 text-fg-2 text-base text-balance">
          {lead}
        </p>
      </div>

      <div className="mt-8">
        <Composer variant="hero" {...composerProps} />
      </div>

      <div className="mt-4 flex justify-center">
        <StoreSelect
          id="store-select-hero"
          label="Retailer"
          value={site}
          onChange={onSiteChange}
          className="w-full max-w-xs"
        />
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-semibold text-fg-2 mb-3">Or start from a common build</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESET_WORKLOADS.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onPickPreset(preset.prompt)}
                className="tactile-btn card min-h-16 px-4 py-3 flex items-center gap-3 text-left hover:border-line-strong hover:bg-surface-2"
              >
                <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{preset.label}</span>
                  <span className="block text-xs text-fg-3">Around {preset.tag}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </m.section>
  );
}
