import { useRef, useEffect } from 'react';
import { Send, Loader2, RefreshCw } from 'lucide-react';
import { PRESET_WORKLOADS, PROMPT_MODIFIERS } from '../lib/constants';

const MAX_HEIGHT_NARROW = 120;
const MAX_HEIGHT_WIDE = 180;

/**
 * Fixed bottom prompt bar. Handles first prompts (with presets) and
 * follow-up refinements (with a "refining" strip).
 */
export default function Composer({
  value, onChange, onSubmit, onStop,
  isBusy, loadingMessage,
  isRefining, showPresets, isNarrow, onReset,
}) {
  const textareaRef = useRef(null);

  // Grow with content (also when a preset or modifier fills the box), capped.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (value !== '') {
      el.style.height = `${Math.min(el.scrollHeight, isNarrow ? MAX_HEIGHT_NARROW : MAX_HEIGHT_WIDE)}px`;
    }
  }, [value, isNarrow]);

  const placeholder = isNarrow
    ? (isRefining ? 'e.g. Upgrade GPU to RTX 4060' : 'e.g. Gaming PC under 75,000 BDT')
    : (isRefining
        ? 'Tweak your build, e.g. "Upgrade GPU to RTX 4060" or "Change RAM to 32GB"'
        : 'Describe your PC, e.g. "Gaming build under 75,000 BDT with Ryzen 5"');

  const canSubmit = value.trim() !== '' && !isBusy;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg/90 backdrop-blur-xl border-t border-line p-3 sm:p-4 z-40 print:hidden">
      <div className="max-w-4xl mx-auto relative">
        {isBusy && (
          <div className="absolute left-1/2 -top-14 -translate-x-1/2 z-50 pointer-events-none">
            <div
              role="status"
              className="surface-float bg-surface border border-line text-fg px-5 py-2 rounded-full flex items-center gap-3 text-sm whitespace-nowrap"
            >
              <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />
              <span>{loadingMessage}</span>
            </div>
          </div>
        )}

        {isRefining && !isBusy && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="chip bg-accent-soft border-accent-line text-accent shrink-0">
                <RefreshCw size={12} aria-hidden="true" />
                Refining your build
              </span>
              <span className="text-xs text-fg-3 hidden sm:inline truncate">
                Ask to swap parts, raise the budget, or change cooling
              </span>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-fg-2 hover:text-bad px-3 min-h-11 shrink-0"
            >
              Start over
            </button>
          </div>
        )}

        {showPresets && (
          <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 mask-fade-edges">
            {PRESET_WORKLOADS.map((preset) => {
              const PresetIcon = preset.icon;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => { onChange(preset.prompt); textareaRef.current?.focus(); }}
                  className="btn min-h-11 rounded-full shrink-0 gap-2 text-xs"
                >
                  <PresetIcon size={14} className="text-accent" aria-hidden="true" />
                  <span>{preset.label}</span>
                  <span className="text-fg-3">{preset.tag}</span>
                </button>
              );
            })}
          </div>
        )}

        {value !== '' && !isBusy && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-xs text-fg-3 shrink-0">Add:</span>
            {PROMPT_MODIFIERS.map((mod) => (
              <button
                key={mod.label}
                type="button"
                onClick={() => onChange(value.trim() + mod.append)}
                className="btn min-h-11 text-xs shrink-0"
              >
                {mod.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2.5 sm:gap-3 items-end">
          <textarea
            ref={textareaRef}
            className="flex-1 min-w-0 bg-surface border border-line focus:border-accent rounded-xl px-4 sm:px-5 py-3 text-fg placeholder:text-fg-3 transition-colors text-sm sm:text-base leading-6 resize-none overflow-y-auto min-h-12 sm:min-h-[52px] block"
            placeholder={placeholder}
            aria-label="Describe the PC you want"
            value={value}
            rows={1}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSubmit) onSubmit();
              }
            }}
            disabled={isBusy}
          />

          <div className="shrink-0 mb-0.5">
            {isBusy ? (
              <button
                type="button"
                onClick={onStop}
                className="btn btn-danger btn-icon sm:w-12 sm:min-h-12"
                title="Stop"
                aria-label="Stop building"
              >
                <span className="w-3.5 h-3.5 bg-current rounded-[3px]" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary btn-icon sm:w-12 sm:min-h-12"
                disabled={!canSubmit}
                title="Build"
                aria-label="Build"
              >
                <Send size={18} strokeWidth={2.2} className="ml-0.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
