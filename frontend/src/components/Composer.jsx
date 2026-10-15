import { useRef, useEffect } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import ModifiersMenu from './ModifiersMenu';
import { LogoMark } from './Logo';

const MAX_HEIGHT_NARROW = 120;
const MAX_HEIGHT_WIDE = 200;

/**
 * Prompt input in two forms:
 * - "hero": large, in-flow, used on the empty state
 * - "dock": floating pill pinned to the bottom once a build exists
 */
export default function Composer({
  variant = 'dock',
  value, onChange, onSubmit, onStop, inputRef,
  isBusy, loadingMessage,
  isRefining, isNarrow, onReset,
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
      ? 'Refine, e.g. cheaper GPU'
      : 'Refine your build, e.g. "Upgrade GPU to RTX 4060"';
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
      <form onSubmit={handleSubmit} className="composer card surface-float p-3 sm:p-4">
        {textarea}
        <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-line">
          <ModifiersMenu onPick={addModifier} disabled={isBusy} />
          {sendOrStop || (
            <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-touch px-5 gap-2">
              <span>Build my PC</span>
              <Send size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-8 pointer-events-none bg-gradient-to-t from-bg via-bg/85 to-transparent print:hidden">
      <div className="max-w-2xl mx-auto relative pointer-events-auto">
        {isBusy && (
          <div className="absolute left-1/2 -top-12 -translate-x-1/2 z-50 pointer-events-none">
            <div
              role="status"
              className="surface-float bg-surface border border-line text-fg px-5 py-2 rounded-full flex items-center gap-3 text-sm whitespace-nowrap"
            >
              <LogoMark size={22} animated className="shrink-0" />
              <span>{loadingMessage}</span>
            </div>
          </div>
        )}

        {isRefining && !isBusy && (
          <div className="hidden sm:flex mb-2 items-center justify-between gap-2 px-1">
            <span className="chip bg-accent-soft border-accent-line text-accent">
              <RefreshCw size={12} aria-hidden="true" />
              Refining your build
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-fg-2 hover:text-bad px-2 min-h-9"
            >
              Start over
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="composer card surface-float rounded-2xl p-1.5 flex items-end gap-1">
          <ModifiersMenu onPick={addModifier} disabled={isBusy} />
          {textarea}
          {sendOrStop || (
            <button
              type="submit"
              className="btn btn-primary btn-icon shrink-0"
              disabled={!canSubmit}
              title="Build"
              aria-label="Build"
            >
              <Send size={18} strokeWidth={2.2} className="ml-0.5" aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
