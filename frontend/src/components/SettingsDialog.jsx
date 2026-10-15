import { motion, AnimatePresence } from 'framer-motion';
import { Key, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';

const PROVIDERS = [
  { value: 'ollama', label: 'Ollama Cloud' },
  { value: 'groq', label: 'Groq Cloud' },
];

export default function SettingsDialog({
  open, onClose, onSaved,
  provider, onProviderChange,
  groqKey, onGroqKeyChange,
  ollamaKey, onOllamaKeyChange,
}) {
  const dialogRef = useDialogFocus(open, onClose);

  const isOllama = provider === 'ollama';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-[var(--scrim)] z-50 flex items-center justify-center p-4 print:hidden"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="card surface-float max-w-md w-full overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 id="settings-title" className="text-lg font-semibold flex items-center gap-2 text-fg">
                <Key className="text-accent" size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>AI settings</span>
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
                    type="password"
                    autoComplete="off"
                    placeholder="Paste your Ollama API key"
                    value={ollamaKey}
                    onChange={(e) => onOllamaKeyChange(e.target.value)}
                    className="w-full min-h-11 bg-surface border border-line focus:border-accent rounded-lg px-4 text-fg placeholder:text-fg-3 font-mono text-sm"
                  />
                  <p className="text-sm text-fg-2 leading-relaxed">
                    Connected to <strong className="text-fg">gpt-oss:120b</strong> on Ollama Cloud with free API quota.
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
                    type="password"
                    autoComplete="off"
                    placeholder="gsk_..."
                    value={groqKey}
                    onChange={(e) => onGroqKeyChange(e.target.value)}
                    className="w-full min-h-11 bg-surface border border-line focus:border-accent rounded-lg px-4 text-fg placeholder:text-fg-3 font-mono text-sm"
                  />
                  <p className="text-sm text-fg-2 leading-relaxed">
                    High-speed inference with your own key skips the public queue limits.
                  </p>
                </div>
              )}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
