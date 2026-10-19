import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { menu } from '../lib/motion';
import { Copy, Key, FileDown, Plus, Menu, X, Link2, Volume2, VolumeX } from 'lucide-react';
import { LogoMark } from './Logo';
import StoreSearchIcon from './icons/StoreSearchIcon';
import StoreSelect from './StoreSelect';

/** True once the page has scrolled away from the very top. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // A 1px marker at the top of the document: when it leaves the viewport, content is under the header.
    const marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;';
    document.body.prepend(marker);
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(marker);
    return () => { observer.disconnect(); marker.remove(); };
  }, []);
  return scrolled;
}

/**
 * Sticky app header. `children` render inside the sticky wrapper beneath the
 * header island (used for the mobile summary bar).
 */
export default function Header({
  site, onSiteChange, siteDisabled,
  onCopy, onShare, onExport, onClear, onOpenSettings, settingsHighlighted,
  onCrossCheck, crossCheckDisabled = false, crossCheckHighlight = false,
  soundOn = true, onToggleSound,
  hideStore = false,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolled = useScrolled();
  const closeThen = (fn) => () => { fn(); setMenuOpen(false); };
  const SoundIcon = soundOn ? Volume2 : VolumeX;
  const soundLabel = soundOn ? 'Mute sounds' : 'Turn sounds on';

  return (
    <div className="sticky top-0 z-40 pt-2 pb-2 sm:pt-4 sm:pb-0 px-3 sm:px-6 print:hidden">
      {/* Phones: a frosted strip behind the header and summary bar, so the gap between them stays
          readable. Desktop: content just fades out as it slides under the floating island. */}
      <div className="lg:hidden absolute inset-0 bg-bg/80 backdrop-blur-xl pointer-events-none" aria-hidden="true" />
      <div className="hidden lg:block absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-bg to-transparent pointer-events-none" aria-hidden="true" />
      <header
        data-scrolled={scrolled}
        className="header-island material relative max-w-7xl mx-auto border border-line rounded-2xl px-4 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 shrink-0">
          <LogoMark size={38} className="shrink-0" />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight text-fg flex items-center gap-2">
              <span>Build<span className="text-accent">MyPC</span></span>
              <span className="hidden sm:inline text-xs font-medium px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent-line">BD</span>
            </p>
            <p className="text-xs text-fg-3 hidden sm:block">AI PC builder for Bangladesh</p>
          </div>
        </div>

        {/* Desktop controls */}
        <div className="hidden lg:flex items-center gap-2">
          {/* The start screen already has a retailer picker; don't show two. */}
          {!hideStore && (
            <StoreSelect
              id="store-select-desktop"
              showLabel={false}
              value={site}
              onChange={onSiteChange}
              disabled={siteDisabled}
              showNotice={false}
              className="mr-1"
            />
          )}
          {!hideStore && onCrossCheck && (
            <button
              type="button"
              onClick={onCrossCheck}
              disabled={crossCheckDisabled}
              aria-haspopup="dialog"
              aria-label="Compare stores"
              className={`btn btn-icon-sm ${crossCheckHighlight ? 'nudge' : ''}`}
              title="Price this build at every store"
            >
              <StoreSearchIcon size={16} strokeWidth={1.75} aria-hidden="true" />
                          </button>
          )}
          <button type="button" onClick={onShare} className="btn btn-icon-sm" title="Copy a link to this build" aria-label="Share link">
            <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {/* Icon-only: every button has a tooltip and an accessible name. */}
          <button type="button" onClick={onCopy} className="btn btn-icon-sm" title="Copy formatted spec sheet" aria-label="Copy spec">
            <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-haspopup="dialog"
            aria-label="API key"
            title="Use your own API key"
            className={`btn btn-icon-sm ${settingsHighlighted ? 'bg-warn-soft border-warn-line text-warn' : ''}`}
          >
            <Key size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              className="btn btn-icon-sm"
              aria-pressed={soundOn}
              aria-label="Sound effects"
              title={soundLabel}
            >
              <SoundIcon size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onExport} className="btn btn-icon-sm" title="Print or save as PDF" aria-label="Export">
            <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {!hideStore && (
            <button type="button" onClick={onClear} className="btn btn-icon-sm border-line-strong text-fg" title="New build: clear this one and start over" aria-label="New build">
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Phones: Compare stores sits next to the menu so it is one tap away, and it is
            highlighted until the user opens it. */}
        <div className="lg:hidden flex items-center gap-1.5 sm:gap-2">
          {!hideStore && (
            <button
              type="button"
              onClick={onClear}
              aria-label="New build"
              title="Clear this build and start a new one"
              className="btn btn-icon"
            >
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          {!hideStore && onCrossCheck && (
            <button
              type="button"
              onClick={onCrossCheck}
              disabled={crossCheckDisabled}
              aria-haspopup="dialog"
              aria-label="Compare stores"
              title="Price this build at every store"
              className={`btn btn-icon ${crossCheckHighlight ? 'nudge' : ''}`}
            >
              <StoreSearchIcon size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="btn btn-icon"
          >
            {menuOpen ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <m.div
            {...menu}
            className="relative max-w-7xl mx-auto mt-2 material border border-line rounded-2xl p-4 lg:hidden flex flex-col gap-3"
          >
            <StoreSelect
              id="store-select-mobile"
              label="Retailer"
              showLabel={false}
              value={site}
              onChange={onSiteChange}
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
              {onToggleSound && (
                <button type="button" onClick={onToggleSound} aria-pressed={soundOn} className="btn btn-touch col-span-2">
                  <SoundIcon size={16} aria-hidden="true" />
                  <span>{soundOn ? 'Sound on' : 'Sound off'}</span>
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="relative">{children}</div>
    </div>
  );
}
