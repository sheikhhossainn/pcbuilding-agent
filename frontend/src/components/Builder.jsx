import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import AmbientBackground from './AmbientBackground';
import BuildProgress from './BuildProgress';
import { useBuild } from '../hooks/useBuild';
import { useCrossCheck } from '../hooks/useCrossCheck';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { computeTelemetry } from '../lib/telemetry';
import { suggestRefines } from '../lib/suggestRefines';
import { formatPrice } from '../lib/format';
import { TOTAL_PARTS, partRowId } from '../lib/constants';
import { buildShareUrl, readShareFromLocation, clearShareFromLocation } from '../lib/share';
import { canCrossCheck, adoptedExplanation } from '../lib/crossCheck';
import Header from './Header';
import MobileSummaryBar from './MobileSummaryBar';
import Notice from './Notice';
import WarningsBanner from './WarningsBanner';
import BuildList from './BuildList';
import RefineSummary from './RefineSummary';
import RationaleCard from './RationaleCard';
import SummaryRail from './SummaryRail';
import Composer from './Composer';
import Hero from './Hero';
import SeoContent from './SeoContent';
import SettingsDialog from './SettingsDialog';
import SwapDrawer from './SwapDrawer';
import CrossCheckDialog from './CrossCheckDialog';
import Toast from './Toast';

// Pipeline steps reported by the API while a job is processing.
// What a build is for, as the engine read it, for the heading.
const USE_LABEL = { gaming: 'Gaming', editing: 'Video editing', office: 'Office', general: 'Everyday' };

const STAGE_MESSAGES = {
  intent: "Reading your requirements...",
  planning: "Planning your budget...",
  selecting: "Finding parts in stock...",
  optimizing: "Using up the rest of your budget...",
  checking: "Checking compatibility...",
  explaining: "Writing the explanation...",
};

function Builder({ page = null }) {
  const { toast, showToast, dismissToast } = useToast();
  const settings = useSettings();
  const isNarrow = useMediaQuery('(max-width: 639px)');

  // A share link (#b=...) opens as the working build; it is validated server-side after load.
  const [sharedBuild] = useState(readShareFromLocation);
  const initialSession = useMemo(() => (sharedBuild ? {
    build: sharedBuild.build,
    explanation: sharedBuild.explanation,
    buildWarnings: sharedBuild.notes,
    notes: sharedBuild.notes,
    power: null,
    previousIntent: sharedBuild.intent,
    // Lets a follow-up refine lock the parts the link contains (specs are re-inferred server-side).
    previousBuild: sharedBuild.build,
  } : null), [sharedBuild]);

  const [site, setSite] = useState(sharedBuild?.site || "startech");
  const [chatInput, setChatInput] = useState(page?.prompt || "");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [swapCategory, setSwapCategory] = useState(null);
  const [crossCheckOpen, setCrossCheckOpen] = useState(false);

  useEffect(() => {
    if (!sharedBuild) return;
    clearShareFromLocation();
    showToast("Opened a shared build");
    // Runs once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customKeys = useMemo(() => ({
    groq: settings.groqKey,
    ollama: settings.ollamaKey,
    provider: settings.provider,
  }), [settings.groqKey, settings.ollamaKey, settings.provider]);

  const buildSession = useBuild({
    site, customKeys, showToast, dismissToast, initialSession,
  });
  const {
    build, total, explanation, warnings, notes, power, previousIntent,
    stage, isBusy, errorMsg, queuePosition, showTrafficWarning, scope, interpretation, lastRefine, clarify,
    versions, currentVersionId,
  } = buildSession;
  const versionNumber = versions.findIndex((v) => v.id === currentVersionId) + 1;

  // category -> what the last refine did to it, for the row badges.
  const changesByCategory = useMemo(
    () => (lastRefine ? Object.fromEntries(lastRefine.changed.map((c) => [c.category, c])) : null),
    [lastRefine]
  );

  const telemetry = useMemo(
    () => computeTelemetry({ build, total, warnings, power }),
    [build, total, warnings, power]
  );

  // Budget the user asked for, as parsed by the engine.
  const budget = Number(previousIntent?.budget_bdt) || 0;

  // "Gaming PC · ৳90,000 budget · live prices from Bangladeshi retailers" under the heading.
  const buildContext = [
    USE_LABEL[previousIntent?.use_case] && `${USE_LABEL[previousIntent.use_case]} PC`,
    budget > 0 && `${formatPrice(budget)} budget`,
    'live prices from Bangladeshi retailers',
  ].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase());

  const refineIdeas = useMemo(
    () => suggestRefines(build, { budget, total }),
    [build, budget, total]
  );

  // Retailer the engine actually used (it can differ from the dropdown); swap needs a real one.
  const swapSite = previousIntent?._applied_site || site;

  // "Compare stores": the working build priced at every other store.
  const crossCheck = useCrossCheck({ build, intent: previousIntent, site: swapSite });
  const crossCheckReady = canCrossCheck(build);
  const crossCheckDisabledReason = crossCheckReady ? '' : 'Needs a CPU, motherboard, RAM and PSU first.';
  const openCrossCheck = () => {
    if (!crossCheckReady) {
      showToast('Add a CPU, motherboard, RAM and PSU before comparing stores');
      return;
    }
    setCrossCheckOpen(true);
    // Reopening shows the last answer; a changed build or a failed run is checked again.
    if (crossCheck.status === 'idle' || crossCheck.status === 'error' || crossCheck.stale) crossCheck.run();
  };
  const closeCrossCheck = useCallback(() => setCrossCheckOpen(false), []);
  const handleAdoptStore = (result) => {
    buildSession.adoptBuild({ ...result, explanation: adoptedExplanation(result) }, `Switched to ${result.label}`);
    setSite(result.site);
    setCrossCheckOpen(false);
  };

  const closeSettings = useCallback(() => setShowSettings(false), []);
  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSwap = useCallback(() => setSwapCategory(null), []);

  const loadingMessage = queuePosition > 0
    ? `Queue position #${queuePosition} — estimated ~${queuePosition * 12}s`
    : STAGE_MESSAGES[stage] || "Building your PC...";

  const handlePickAlternative = (part) => {
    buildSession.swapPart(swapCategory, part);
    setSwapCategory(null);
  };

  const handleShare = () => {
    if (telemetry.configuredCount === 0) {
      showToast("Build a PC first, then share it");
      return;
    }
    const url = buildShareUrl({
      build, intent: previousIntent, notes, explanation, site: swapSite,
    });
    navigator.clipboard.writeText(url).then(
      () => showToast("Link copied"),
      () => showToast("Couldn't copy the link")
    );
  };

  const scrollToSummary = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('summary-rail')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const handleSubmit = () => buildSession.submit(chatInput, () => setChatInput(""));

  const inputRef = useRef(null);

  // No parts and nothing in flight: show the focused start screen instead of 12 empty rows.
  const showHero = telemetry.configuredCount === 0 && !isBusy && !previousIntent;

  const composerProps = {
    value: chatInput,
    onChange: setChatInput,
    onSubmit: handleSubmit,
    onStop: buildSession.stop,
    inputRef,
    isBusy,
    loadingMessage,
    isRefining: Boolean(previousIntent),
    suggestions: refineIdeas,
    isNarrow,
    versionNumber,
  };

  // Scroll a part row into view and ring it briefly (from the change summary).
  const focusPart = (category) => {
    const el = document.getElementById(partRowId(category));
    if (!el) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('is-flashing');
    // Restart the animation when the same row is picked twice.
    void el.offsetWidth;
    el.classList.add('is-flashing');
    setTimeout(() => el.classList.remove('is-flashing'), 1500);
  };

  const pickPreset = (prompt) => {
    setChatInput(prompt);
    inputRef.current?.focus();
  };

  // Smooth-scroll to the prompt box, then focus it without a second (instant) jump.
  const scrollToComposer = () => {
    const el = inputRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    // Focusing mid-scroll cancels a smooth scroll, so focus once it has settled.
    let focused = false;
    const focusInput = () => {
      if (focused) return;
      focused = true;
      window.removeEventListener('scrollend', focusInput);
      el.focus({ preventScroll: true });
    };
    if (reduceMotion) {
      focusInput();
    } else {
      window.addEventListener('scrollend', focusInput, { once: true });
      setTimeout(focusInput, 900);
    }
  };

  const handleCopySpecSheet = () => {
    const items = Object.entries(build).filter(([, item]) => Boolean(item));
    if (items.length === 0) {
      showToast("No parts to copy yet");
      return;
    }

    const rule = "═══════════════════════════════════════";
    let text = `BuildMyPC Configuration — ${formatPrice(total)}\n`;
    text += `Source: ${site.toUpperCase()} (Bangladesh)\n${rule}\n`;
    items.forEach(([category, item]) => {
      text += `• ${category}: ${item.name} — ${formatPrice(item.price)}\n`;
      if (item.url) text += `  ${item.url}\n`;
    });
    text += `${rule}\n`;
    text += `Estimated power draw: ~${telemetry.estimatedDraw}W (recommended PSU: ${telemetry.recommendedPsu}W+)\n`;
    if (warnings.length > 0) {
      text += `\nWarnings:\n${warnings.map((w) => `- ${String(w).replace(/\*\*/g, '')}`).join('\n')}\n`;
    }
    if (explanation) text += `\nAI notes: ${explanation}\n`;
    text += `\nBuilt with BuildMyPC AI Configurator`;

    navigator.clipboard.writeText(text).then(
      () => showToast("Spec sheet copied"),
      () => showToast("Unable to copy to clipboard")
    );
  };

  const handleExport = () => window.print();

  return (
    <div className="min-h-screen pb-44 sm:pb-36 text-fg">
      <AmbientBackground />
      <Header
        site={site}
        onSiteChange={setSite}
        siteDisabled={isBusy}
        onCopy={handleCopySpecSheet}
        onShare={handleShare}
        onExport={handleExport}
        onClear={buildSession.clear}
        onCrossCheck={openCrossCheck}
        crossCheckDisabled={isBusy || !crossCheckReady}
        onOpenSettings={openSettings}
        settingsHighlighted={showTrafficWarning}
        hideStore={showHero}
        busy={isBusy}
      >
        <MobileSummaryBar
          total={total}
          budget={budget}
          configuredCount={telemetry.configuredCount}
          incompatibleCount={telemetry.incompatibleCount}
          noteCount={telemetry.noteCount}
          onClick={scrollToSummary}
        />
      </Header>

      <main className="max-w-7xl mx-auto mt-6 px-3 sm:px-6">
        <AnimatePresence>
          {showTrafficWarning && (
            <Notice key="traffic" tone="warn" onDismiss={buildSession.dismissTrafficWarning}>
              <strong>The shared AI queue is busy.</strong> Add your own{' '}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
              >
                free Groq API key
              </a>{' '}
              in{' '}
              <button type="button" onClick={openSettings} className="underline font-semibold">
                settings
              </button>{' '}
              to skip the wait.
            </Notice>
          )}
        </AnimatePresence>

        {errorMsg && (
          <Notice tone="bad" role="alert">
            <p className="font-medium">{errorMsg}</p>
          </Notice>
        )}

        {clarify && (
          <Notice tone="info" role="status" onDismiss={buildSession.dismissClarify}>
            <p className="font-medium">{clarify}</p>
            <p className="text-fg-2 mt-1">Your build was not changed. Type your answer below and send it again.</p>
          </Notice>
        )}

        {showHero ? (
          <Hero
            composerProps={composerProps}
            onPickPreset={pickPreset}
            site={site}
            onSiteChange={setSite}
            heading={page?.h1}
            lead={page?.lead}
          />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-fg flex flex-wrap items-center gap-2">
                  <span>Your build</span>
                  <span className="chip num hidden sm:inline-flex">{telemetry.configuredCount} of {TOTAL_PARTS} parts</span>
                </h1>
                <p className="text-sm text-fg-3 mt-1 hidden sm:block">
                  {buildContext}
                </p>
              </div>

              <label className="flex items-center gap-2 min-h-11 cursor-pointer text-fg-2 text-sm font-medium hover:text-fg transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-line-strong accent-[var(--accent)] cursor-pointer"
                  checked={hideEmpty}
                  onChange={(e) => setHideEmpty(e.target.checked)}
                />
                <span>Hide empty</span>
              </label>
            </div>

            <AnimatePresence>
              {isBusy && (
                <BuildProgress
                  key="progress"
                  stage={stage}
                  message={loadingMessage}
                  request={previousIntent ? chatInput.trim() : ''}
                  interpretation={interpretation}
                />
              )}
            </AnimatePresence>

            {!isBusy && lastRefine && (
              <RefineSummary
                refine={lastRefine}
                total={total}
                budget={budget}
                onUndo={buildSession.undoRefine}
                onDismiss={buildSession.dismissRefine}
                onFocusPart={focusPart}
                onFixBudget={() => {
                  // Through the input, so the progress card and a failed attempt both show the request.
                  setChatInput('Make it cheaper');
                  buildSession.submit('Make it cheaper', () => setChatInput(''));
                }}
              />
            )}

            {!isBusy && <WarningsBanner warnings={warnings} />}

            <BuildList
              build={build}
              hideEmpty={hideEmpty}
              isBusy={isBusy}
              refining={Boolean(previousIntent)}
              changing={scope}
              changes={changesByCategory}
              onRemove={buildSession.removePart}
              onSwap={swapSite ? setSwapCategory : undefined}
            />

            <RationaleCard explanation={explanation} />
          </div>

          <SummaryRail
            telemetry={telemetry}
            total={total}
            budget={budget}
            onCopy={handleCopySpecSheet}
            onShare={handleShare}
            onExport={handleExport}
            versions={versions}
            currentVersionId={currentVersionId}
            onRestoreVersion={buildSession.restoreVersion}
            busy={isBusy}
            crossCheck={crossCheck}
            onCrossCheck={openCrossCheck}
            crossCheckDisabledReason={crossCheckDisabledReason}
          />
        </div>
        )}
        {showHero && <SeoContent page={page} onStart={scrollToComposer} />}
      </main>

      {!showHero && <Composer variant="dock" {...composerProps} />}

      <SwapDrawer
        category={swapCategory}
        current={swapCategory ? build[swapCategory] : null}
        site={swapSite}
        build={build}
        intent={previousIntent}
        isNarrow={isNarrow}
        onClose={closeSwap}
        onPick={handlePickAlternative}
      />

      <CrossCheckDialog
        open={crossCheckOpen}
        onClose={closeCrossCheck}
        isNarrow={isNarrow}
        check={crossCheck}
        referenceSite={swapSite}
        build={build}
        budget={budget}
        onRun={crossCheck.run}
        onAdopt={handleAdoptStore}
      />

      <SettingsDialog
        open={showSettings}
        onClose={closeSettings}
        onSaved={() => showToast("API settings saved")}
        provider={settings.provider}
        onProviderChange={settings.setProvider}
        groqKey={settings.groqKey}
        onGroqKeyChange={settings.setGroqKey}
        ollamaKey={settings.ollamaKey}
        onOllamaKeyChange={settings.setOllamaKey}
      />

      <Toast toast={toast} />
    </div>
  );
}

export default Builder;
