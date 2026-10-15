import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Copy, Key, FileDown, Trash2, Menu, X, Link2 } from 'lucide-react';
import StoreSelect from './StoreSelect';
import ThemeToggle from './ThemeToggle';

/**
 * Sticky app header. `children` render inside the sticky wrapper beneath the
 * header island (used for the mobile summary bar).
 */
export default function Header({
  site, onSiteChange, customSiteUrl, onCustomSiteUrlChange, siteDisabled,
  theme, onToggleTheme,
  onCopy, onShare, onExport, onClear, onOpenSettings, settingsHighlighted,
  hideStore = false,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeThen = (fn) => () => { fn(); setMenuOpen(false); };

  return (
    <div className="sticky top-0 z-40 pt-2 pb-2 sm:pt-4 sm:pb-0 px-3 sm:px-6 bg-bg/95 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none print:hidden">
      <header className="max-w-7xl mx-auto card px-4 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-accent text-accent-fg p-2 rounded-lg" aria-hidden="true">
            <Sparkles size={18} strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight text-fg flex items-center gap-2">
              BuildMyPC
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent-line">BD</span>
            </h1>
            <p className="text-xs text-fg-3 hidden sm:block">AI PC builder for Bangladesh</p>
          </div>
        </div>

        {/* Desktop controls */}
        <div className="hidden lg:flex items-center gap-2">
          {/* The start screen already has a retailer picker; don't show two. */}
          {!hideStore && (
            <StoreSelect
              id="store-select-desktop"
              value={site}
              onChange={onSiteChange}
              customUrl={customSiteUrl}
              onCustomUrlChange={onCustomSiteUrlChange}
              disabled={siteDisabled}
              className="mr-1"
            />
          )}
          <button type="button" onClick={onShare} className="btn" title="Copy a link to this build">
            <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Share</span>
          </button>
          <button type="button" onClick={onCopy} className="btn" title="Copy formatted spec sheet">
            <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Copy spec</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-haspopup="dialog"
            className={`btn ${settingsHighlighted ? 'bg-warn-soft border-warn-line text-warn' : ''}`}
          >
            <Key size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>API key</span>
          </button>
          <button type="button" onClick={onExport} className="btn" title="Print or save as PDF">
            <FileDown size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Export</span>
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" onClick={onClear} className="btn btn-danger" title="Clear current build">
            <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="lg:hidden btn btn-icon"
        >
          {menuOpen ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="max-w-7xl mx-auto mt-2 card surface-float p-4 lg:hidden flex flex-col gap-3"
          >
            <StoreSelect
              id="store-select-mobile"
              label="Retailer"
              value={site}
              onChange={onSiteChange}
              customUrl={customSiteUrl}
              onCustomUrlChange={onCustomSiteUrlChange}
              disabled={siteDisabled}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={closeThen(onShare)} className="btn btn-touch">
                <Link2 size={16} aria-hidden="true" />
                <span>Share link</span>
              </button>
              <button type="button" onClick={closeThen(onCopy)} className="btn btn-touch">
                <Copy size={16} aria-hidden="true" />
                <span>Copy spec</span>
              </button>
              <button type="button" onClick={closeThen(onOpenSettings)} aria-haspopup="dialog" className="btn btn-touch">
                <Key size={16} aria-hidden="true" />
                <span>API key</span>
              </button>
              <button type="button" onClick={closeThen(onExport)} className="btn btn-touch">
                <FileDown size={16} aria-hidden="true" />
                <span>Export PDF</span>
              </button>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} touch withLabel />
              <button type="button" onClick={closeThen(onClear)} className="btn btn-touch btn-danger col-span-2">
                <Trash2 size={16} aria-hidden="true" />
                <span>Clear build</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
}
