import { m, AnimatePresence } from 'framer-motion';
import { backdrop, dialog } from '../lib/motion';
import { Key, X, Volume2, Vibrate } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';

// Desktop Chrome has navigator.vibrate but no motor; only offer the switch on touch devices.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function Switch({ id, icon: Icon, label, hint, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 min-h-11 cursor-pointer">
      <Icon size={16} className="text-fg-3 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-xs text-fg-3">{hint}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative w-10 h-6 shrink-0 rounded-full border border-line-strong bg-surface-2 transition-colors
          peer-checked:bg-accent peer-checked:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2
          after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-[18px] after:h-[18px] after:rounded-full after:bg-fg
          after:transition-transform after:duration-200 after:ease-[var(--motion-ease-out)] peer-checked:after:translate-x-4"
      />
    </label>
  );
}

const PROVIDERS = [
  { value: 'ollama', label: 'Ollama Cloud' },
  { value: 'groq', label: 'Groq Cloud' },
];

export default function SettingsDialog({
  open, onClose, onSaved,
  provider, onProviderChange,
  groqKey, onGroqKeyChange,
  ollamaKey, onOllamaKeyChange,
  sound, onSoundChange, haptics, onHapticsChange,
}) {
  const dialogRef = useDialogFocus(open, onClose);

  const isOllama = provider === 'ollama';

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="settings-backdrop"
          {...backdrop}
          className="fixed inset-0 bg-[var(--scrim)] z-50 flex items-center justify-center p-4 print:hidden"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <m.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
            {...dialog}
            className="card surface-float max-w-md w-full overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 id="settings-title" className="text-lg font-semibold flex items-center gap-2 text-fg">
                <Key className="text-accent" size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Settings</span>
              </h3>
              <button type="button" onClick={onClose} aria-label="Close settings" className="btn btn-icon">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex p-1 bg-surface-2 rounded-xl border border-line gap-1">
                {PROVIDERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onProviderChange(value)}
                    aria-pressed={provider === value}
                    className={`flex-1 min-h-11 text-sm font-medium rounded-lg transition-colors ${
                      provider === value
                        ? 'bg-accent text-accent-fg'
                        : 'text-fg-2 hover:text-fg'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isOllama ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="ollama-key" className="text-sm font-semibold text-fg">Ollama API key</label>
                    <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent text-sm underline">
                      ollama.com ↗
                    </a>
                  </div>
                  <input
                    id="ollama-key"
                    type="text"
                    name="ai-api-key"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    placeholder="Paste your Ollama API key"
                    value={ollamaKey}
                    onChange={(e) => onOllamaKeyChange(e.target.value)}
                    className="secret-input w-full min-h-11 bg-surface border border-line focus:border-accent rounded-lg px-4 text-fg placeholder:text-fg-3 font-mono text-sm"
                  />
                  {ollamaKey && (
                    <button type="button" onClick={() => onOllamaKeyChange('')} className="text-sm text-fg-3 hover:text-fg underline">
                      Clear saved key
                    </button>
                  )}
                  <p className="text-sm text-fg-2 leading-relaxed">
                    Uses Ollama Cloud with free API quota. Add your own key to skip the public queue.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="groq-key" className="text-sm font-semibold text-fg">Groq API key</label>
                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-accent text-sm underline">
                      console.groq.com ↗
                    </a>
                  </div>
                  <input
                    id="groq-key"
                    type="text"
                    name="ai-api-key"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    placeholder="gsk_..."
                    value={groqKey}
                    onChange={(e) => onGroqKeyChange(e.target.value)}
                    className="secret-input w-full min-h-11 bg-surface border border-line focus:border-accent rounded-lg px-4 text-fg placeholder:text-fg-3 font-mono text-sm"
                  />
                  {groqKey && (
                    <button type="button" onClick={() => onGroqKeyChange('')} className="text-sm text-fg-3 hover:text-fg underline">
                      Clear saved key
                    </button>
                  )}
                  <p className="text-sm text-fg-2 leading-relaxed">
                    High-speed inference with your own key skips the public queue limits.
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-line space-y-1">
                <h4 className="text-sm font-semibold text-fg mb-1">Sound &amp; haptics</h4>
                <Switch
                  id="pref-sound"
                  icon={Volume2}
                  label="Sound effects"
                  hint="Soft sounds when a build is ready, a part is swapped or a link is copied."
                  checked={sound}
                  onChange={onSoundChange}
                />
                {canVibrate && (
                  <Switch
                    id="pref-haptics"
                    icon={Vibrate}
                    label="Vibration"
                    hint="A light tap on supported phones."
                    checked={haptics}
                    onChange={onHapticsChange}
                  />
                )}
              </div>
            </div>

            <div className="p-5 border-t border-line flex justify-end bg-surface-2">
              <button
                type="button"
                onClick={() => { onClose(); onSaved(); }}
                className="btn btn-primary btn-touch px-5"
              >
                Save &amp; close
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
