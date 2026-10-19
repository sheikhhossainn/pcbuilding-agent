import { useRef, useEffect } from 'react';
import { m } from 'framer-motion';
import { spring } from '../lib/motion';
import { Send, RefreshCw } from 'lucide-react';
import ModifiersMenu from './ModifiersMenu';
import { LogoMark } from './Logo';

const MAX_HEIGHT_NARROW = 120;
const MAX_HEIGHT_WIDE = 200;

// The hero box and the dock are one element to the eye: when the first build starts, the
// prompt box glides from the middle of the page into the dock (and back on "New build").
const morph = {
  layoutId: 'composer',
  transition: { layout: spring.smooth },
  style: { borderRadius: 16 },
};

/**
 * Prompt input in two forms:
 * - "hero": large, in-flow, used on the empty state
 * - "dock": floating pill pinned to the bottom once a build exists
 */
export default function Composer({
  variant = 'dock',
  value, onChange, onSubmit, onStop, inputRef,
  isBusy, loadingMessage,
  isRefining, isNarrow, suggestions = [], versionNumber = 0,
}) {
  const fallbackRef = useRef(null);
  const textareaRef = inputRef || fallbackRef;
  const isHero = variant === 'hero';

  // Grow with content (also when a preset or modifier fills the box), capped.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (value !== '') {
      const max = isNarrow ? MAX_HEIGHT_NARROW : MAX_HEIGHT_WIDE;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    }
  }, [value, isNarrow, textareaRef]);

  let placeholder;
  if (isHero) {
    placeholder = isNarrow
      ? 'e.g. Gaming PC under 75,000 BDT'
      : 'e.g. Gaming build under 75,000 BDT with Ryzen 5 and 16GB RAM';
  } else if (isRefining) {
    placeholder = isNarrow
      ? 'Refine, e.g. cheaper monitor'
      : 'Refine, e.g. "monitor around 20k, put the savings into a stronger PSU"';
  } else {
    placeholder = 'Describe your PC...';
  }

  const canSubmit = value.trim() !== '' && !isBusy;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit();
  };

  const addModifier = (append) => {
    const base = value.trim();
    // Modifiers are written as ", more detail"; drop the comma when there is nothing to follow.
    onChange(base ? base + append : append.replace(/^,\s*/, ''));
    textareaRef.current?.focus();
  };

  const textarea = (
    <textarea
      ref={textareaRef}
      className={`composer-input flex-1 min-w-0 bg-transparent border-0 resize-none overflow-y-auto block text-fg placeholder:text-fg-3 text-base leading-6 ${
        isHero ? 'w-full px-1 py-1 min-h-24' : 'px-1 py-3 min-h-12'
      }`}
      placeholder={placeholder}
      aria-label="Describe the PC you want"
      value={value}
      rows={isHero ? 3 : 1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (canSubmit) onSubmit();
        }
      }}
      disabled={isBusy}
    />
  );

  const sendOrStop = isBusy ? (
    <button
      type="button"
      onClick={onStop}
      className="btn btn-danger btn-icon shrink-0"
      title="Stop"
      aria-label="Stop building"
    >
      <span className="w-3.5 h-3.5 bg-current rounded-[3px]" aria-hidden="true" />
    </button>
  ) : null;

  if (isHero) {
    return (
      <m.form {...morph} onSubmit={handleSubmit} className="composer card surface-float p-3 sm:p-4">
        <m.div layout="position">{textarea}</m.div>
        <m.div layout="position" className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-line">
          <ModifiersMenu onPick={addModifier} disabled={isBusy} />
          {sendOrStop || (
            <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-touch px-5 gap-2">
              <span>Build my PC</span>
              <Send size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </m.div>
      </m.form>
    );
  }

  return (
    // Lined up with the parts column (8 of 12 on desktop) so it never covers the summary rail.
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none print:hidden">
      <div className="lg:hidden absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg via-bg/90 to-transparent" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 pb-3 lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="relative lg:col-span-8 max-w-2xl lg:max-w-none mx-auto w-full pointer-events-auto">
          {/* Desktop: the fade stays over the parts column and leaves the summary rail readable. */}
          <div className="hidden lg:block absolute inset-x-0 -top-10 -bottom-3 bg-gradient-to-t from-bg via-bg/90 to-transparent pointer-events-none" aria-hidden="true" />
          <m.div {...morph} className="composer card surface-float relative">
            {isBusy ? (
              <m.div layout="position" className="flex items-center gap-2.5 px-3.5 pt-2.5 text-sm text-fg-2 min-w-0">
                <LogoMark size={18} animated className="shrink-0" />
                <span className="truncate">{loadingMessage}</span>
              </m.div>
            ) : isRefining && (
              <m.div layout="position" className="flex items-center gap-2 pl-3.5 pt-2 min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium text-accent shrink-0">
                  <RefreshCw size={12} aria-hidden="true" />
                  {versionNumber > 1 ? `Refining version ${versionNumber}` : 'Refining'}
                </span>
                {value === '' && suggestions.length > 0 && (
                  <div
                    role="group"
                    aria-label="Refine ideas"
                    className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar mask-fade-edges pr-3 py-0.5"
                  >
                    {suggestions.map((idea) => (
                      <button
                        key={idea}
                        type="button"
                        onClick={() => { onChange(idea); textareaRef.current?.focus(); }}
                        className="chip shrink-0 whitespace-nowrap min-h-7 px-2.5 cursor-pointer hover:border-accent-line hover:text-fg"
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                )}
              </m.div>
            )}

            <m.form layout="position" onSubmit={handleSubmit} className="p-1.5 flex items-end gap-1">
              <ModifiersMenu onPick={addModifier} disabled={isBusy} />
              {textarea}
              {sendOrStop || (
                <button
                  type="submit"
                  className="btn btn-primary btn-icon shrink-0"
                  disabled={!canSubmit}
                  title={isRefining ? 'Refine' : 'Build'}
                  aria-label={isRefining ? 'Refine build' : 'Build'}
                >
                  <Send size={18} strokeWidth={2.2} className="ml-0.5" aria-hidden="true" />
                </button>
              )}
            </m.form>
          </m.div>
        </div>
      </div>
    </div>
  );
}
