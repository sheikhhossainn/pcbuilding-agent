import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { INITIAL_BUILD, BUSY_STATES } from '../lib/constants';
import { sumBuild } from '../lib/format';
import { diffBuilds } from '../lib/buildDiff';
import { keepLastingNotes } from '../lib/staleNotes';

const SESSION_KEY = 'buildmypc.session.v1';
const POLL_INTERVAL_MS = 800;
const REVALIDATE_DEBOUNCE_MS = 400;
// Versions kept for the "Versions" list; the oldest drop off first.
const MAX_VERSIONS = 10;

// Pipeline step reported by the API -> coarse UI state used for busy/idle logic.
const STAGE_TO_STATE = {
  intent: 'analyzing',
  planning: 'analyzing',
  selecting: 'selecting',
  optimizing: 'selecting',
  checking: 'checking',
  explaining: 'checking',
};

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !saved.build) return null;
    return saved;
  } catch {
    return null;
  }
}

const buildSignature = (build) =>
  Object.entries(build)
    .filter(([, item]) => item)
    .map(([category, item]) => `${category}:${item.name}:${item.price}`)
    .join('|');

// Only what the validator needs; specs are re-inferred server-side.
const toValidationPayload = (build) =>
  Object.fromEntries(
    Object.entries(build)
      .filter(([, item]) => item)
      .map(([category, item]) => [category, { name: item.name, price: item.price, url: item.url || null }])
  );

const toValidationIntent = (intent) => ({
  use_case: intent?.use_case,
  budget_bdt: intent?.budget_bdt,
  component_strategy: {
    Storage: intent?.component_strategy?.Storage,
    RAM: intent?.component_strategy?.RAM,
  },
});

/**
 * Owns the build session: parts, warnings, AI job lifecycle (submit, poll, stop),
 * persistence across refresh, remove/swap/undo, and re-validation after edits.
 *
 * @param {object} opts
 * @param {string} opts.site - retailer key or custom URL
 * @param {{groq: string, ollama: string, provider: string}} opts.customKeys
 * @param {(message: string, action?: {label: string, onClick: () => void}) => void} opts.showToast
 * @param {() => void} opts.dismissToast
 * @param {object|null} [opts.initialSession] - e.g. a decoded share link; wins over saved session
 */
export function useBuild({ site, customKeys, showToast, dismissToast, initialSession = null }) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const [savedSession] = useState(() => initialSession || loadSavedSession());

  const [build, setBuild] = useState(() => ({ ...INITIAL_BUILD, ...(savedSession?.build || {}) }));
  const [explanation, setExplanation] = useState(savedSession?.explanation || "");
  const [warnings, setWarnings] = useState(savedSession?.buildWarnings || []);
  // Selection-time warnings (fallbacks, missing parts). Validator output is added on top of these.
  const [notes, setNotes] = useState(
    () => savedSession?.notes
      ?? (savedSession?.buildWarnings || []).filter((w) => !String(w).includes('INCOMPATIBLE'))
  );
  const [power, setPower] = useState(savedSession?.power || null);
  // Parts the user removed by hand. Sent with the next refine so the engine doesn't re-add them.
  const [removedCategories, setRemovedCategories] = useState(savedSession?.removedCategories || []);
  const [previousIntent, setPreviousIntent] = useState(savedSession?.previousIntent || null);
  const [previousBuild, setPreviousBuild] = useState(savedSession?.previousBuild || null);

  // Refine progress: which parts the server is searching again (undefined = not known yet,
  // null = all of them), what the last refine changed, and a question when the message was unclear.
  const [scope, setScope] = useState(undefined);
  const [lastRefine, setLastRefine] = useState(null);
  const [clarify, setClarify] = useState("");
  // How the running refine was understood, as chips: [{label, text}]. Known a couple of seconds in.
  const [interpretation, setInterpretation] = useState(null);
  // The session as it was before the running refine, so the whole refine can be undone.
  const refineSnapshotRef = useRef(null);
  // Every finished build and refine, oldest first: {id, label, total, at, session}. Restoring one
  // keeps the others, so a good build survives a refine that went the wrong way.
  const [versions, setVersions] = useState(savedSession?.versions || []);
  const [currentVersionId, setCurrentVersionId] = useState(savedSession?.currentVersionId ?? null);

  const [loadingState, setLoadingState] = useState("idle"); // idle | analyzing | selecting | checking | success | error
  const [stage, setStage] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [queuePosition, setQueuePosition] = useState(0);
  const [showTrafficWarning, setShowTrafficWarning] = useState(false);

  const pollRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const validateRequestRef = useRef(0);
  // Signature of the build the server last validated. A shared link, or a session saved
  // before the API returned `power`, starts unvalidated (null) and is checked once on load.
  const validatedSignatureRef = useRef(
    initialSession || !savedSession?.power ? null : buildSignature(build)
  );

  const total = useMemo(() => sumBuild(build), [build]);
  const signature = useMemo(() => buildSignature(build), [build]);
  const isBusy = BUSY_STATES.includes(loadingState);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const cancelInFlight = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopPolling();
    // Invalidate any request that is still resolving.
    requestIdRef.current += 1;
    validateRequestRef.current += 1;
  }, [stopPolling]);

  // Stop timers/requests if the component goes away.
  useEffect(() => cancelInFlight, [cancelInFlight]);

  // Persist the working build so a refresh doesn't lose it.
  useEffect(() => {
    try {
      const hasParts = Object.values(build).some(Boolean);
      if (!hasParts) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        build, explanation, buildWarnings: warnings, notes, power,
        previousIntent, previousBuild, removedCategories, versions, currentVersionId,
      }));
    } catch {
      // storage unavailable (private mode / quota) — session just won't persist
    }
  }, [build, explanation, warnings, notes, power, previousIntent, previousBuild, removedCategories, versions, currentVersionId]);

  // After the user removes/swaps/undoes a part, re-run compatibility + power checks
  // on the server so the warnings and power card never describe a build that no longer exists.
  useEffect(() => {
    if (!previousIntent || signature === '' || isBusy) return undefined;
    if (validatedSignatureRef.current === signature) return undefined;

    const handle = setTimeout(async () => {
      const requestId = ++validateRequestRef.current;
      try {
        const { data } = await axios.post(`${apiBaseUrl}/api/build/validate`, {
          build: toValidationPayload(build),
          intent: toValidationIntent(previousIntent),
        });
        if (requestId !== validateRequestRef.current) return;
        validatedSignatureRef.current = signature;
        // Notes about the build as the engine made it ("X BDT unspent") no longer hold after a manual edit.
        const lasting = keepLastingNotes(notes);
        if (lasting.length !== notes.length) setNotes(lasting);
        setWarnings([...lasting, ...(data.warnings || [])]);
        setPower(data.power || null);
      } catch {
        if (requestId !== validateRequestRef.current) return;
        // Don't loop on a failing endpoint; the next edit retries.
        validatedSignatureRef.current = signature;
        showToast("Couldn't re-check compatibility. Results above may be out of date.");
      }
    }, REVALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [signature, build, notes, previousIntent, isBusy, apiBaseUrl, showToast]);

  const clear = useCallback(() => {
    const hadContent = Object.values(build).some(Boolean) || Boolean(explanation) || Boolean(errorMsg) || isBusy;
    const hadParts = Object.values(build).some(Boolean);
    // Everything needed to bring the cleared session back from the toast.
    const cleared = {
      build, explanation, warnings, notes, power, previousIntent, previousBuild, removedCategories,
      versions, currentVersionId, validatedSignature: validatedSignatureRef.current,
    };
    cancelInFlight();
    setBuild(INITIAL_BUILD);
    setExplanation("");
    setErrorMsg("");
    setWarnings([]);
    setNotes([]);
    setPower(null);
    setLoadingState("idle");
    setStage(null);
    setQueuePosition(0);
    setShowTrafficWarning(false);
    setPreviousIntent(null);
    setPreviousBuild(null);
    setRemovedCategories([]);
    setScope(undefined);
    setInterpretation(null);
    setLastRefine(null);
    setClarify("");
    setVersions([]);
    setCurrentVersionId(null);
    refineSnapshotRef.current = null;
    validatedSignatureRef.current = '';
    if (!hadContent) return;
    showToast("Build cleared", hadParts ? {
      label: 'Undo',
      onClick: () => {
        setBuild(cleared.build);
        setExplanation(cleared.explanation);
        setWarnings(cleared.warnings);
        setNotes(cleared.notes);
        setPower(cleared.power);
        setPreviousIntent(cleared.previousIntent);
        setPreviousBuild(cleared.previousBuild);
        setRemovedCategories(cleared.removedCategories);
        setVersions(cleared.versions);
        setCurrentVersionId(cleared.currentVersionId);
        validatedSignatureRef.current = cleared.validatedSignature;
        dismissToast();
      },
    } : null);
  }, [
    build, explanation, warnings, notes, power, previousIntent, previousBuild, removedCategories,
    versions, currentVersionId, errorMsg, isBusy, cancelInFlight, showToast, dismissToast,
  ]);

  const stop = useCallback(() => {
    cancelInFlight();
    setLoadingState("idle");
    setStage(null);
    setScope(undefined);
    setInterpretation(null);
    setErrorMsg("");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    showToast("Build generation stopped");
  }, [cancelInFlight, showToast]);

  const removePart = useCallback((category) => {
    const removed = build[category];
    if (!removed) return;
    setLastRefine(null);
    setBuild((prev) => ({ ...prev, [category]: null }));
    // Tell the next refine this part is intentionally gone, and don't lock the old one back in.
    setRemovedCategories((prev) => (prev.includes(category) ? prev : [...prev, category]));
    setPreviousBuild((prev) => (prev ? { ...prev, [category]: null } : prev));

    showToast(`Removed ${category}`, {
      label: 'Undo',
      onClick: () => {
        setBuild((prev) => (prev[category] ? prev : { ...prev, [category]: removed }));
        setRemovedCategories((prev) => prev.filter((c) => c !== category));
        setPreviousBuild((prev) => (prev ? { ...prev, [category]: removed } : prev));
        dismissToast();
      },
    });
  }, [build, showToast, dismissToast]);

  const swapPart = useCallback((category, part) => {
    const before = build[category] || null;
    setLastRefine(null);
    setBuild((prev) => ({ ...prev, [category]: part }));
    // Keep follow-up "refine" requests in sync so the engine locks the part the user chose.
    setPreviousBuild((prev) => (prev ? { ...prev, [category]: part } : prev));
    setRemovedCategories((prev) => prev.filter((c) => c !== category));

    showToast(`Swapped ${category}`, before ? {
      label: 'Undo',
      onClick: () => {
        setBuild((prev) => ({ ...prev, [category]: before }));
        setPreviousBuild((prev) => (prev ? { ...prev, [category]: before } : prev));
        dismissToast();
      },
    } : null);
  }, [build, showToast, dismissToast]);

  const dismissTrafficWarning = useCallback(() => setShowTrafficWarning(false), []);
  const dismissRefine = useCallback(() => setLastRefine(null), []);
  const dismissClarify = useCallback(() => setClarify(""), []);

  /** Put the whole session back to how it was before the last refine. */
  const undoRefine = useCallback(() => {
    const snap = refineSnapshotRef.current;
    if (!snap) return;
    cancelInFlight();
    setBuild(snap.build);
    setExplanation(snap.explanation);
    setWarnings(snap.warnings);
    setNotes(snap.notes);
    setPower(snap.power);
    setPreviousIntent(snap.previousIntent);
    setPreviousBuild(snap.previousBuild);
    setRemovedCategories(snap.removedCategories);
    validatedSignatureRef.current = snap.validatedSignature;
    setCurrentVersionId(snap.versionId ?? null);
    setLastRefine(null);
    refineSnapshotRef.current = null;
    showToast("Restored your previous build");
  }, [cancelInFlight, showToast]);

  /** Make an earlier version the working build. Newer versions stay in the list. */
  const restoreVersion = useCallback((id) => {
    const version = versions.find((v) => v.id === id);
    if (!version || isBusy) return;
    const { session } = version;
    cancelInFlight();
    setBuild({ ...INITIAL_BUILD, ...session.build });
    setExplanation(session.explanation || "");
    setWarnings(session.warnings || []);
    setNotes(session.notes || []);
    setPower(session.power || null);
    setPreviousIntent(session.previousIntent || null);
    setPreviousBuild(session.previousBuild || null);
    setRemovedCategories([]);
    // The server validated this build when it made it.
    validatedSignatureRef.current = buildSignature({ ...INITIAL_BUILD, ...session.build });
    setCurrentVersionId(id);
    setLastRefine(null);
    setErrorMsg("");
    refineSnapshotRef.current = null;
    showToast(`Restored "${version.label}"`);
  }, [versions, isBusy, cancelInFlight, showToast]);

  /**
   * @param {string} message - the user's prompt
   * @param {() => void} [onSuccess] - called when the build completes
   */
  const submit = useCallback(async (message, onSuccess) => {
    if (!message.trim() || isBusy) return;

    cancelInFlight();
    setLoadingState("analyzing");
    setStage(null);
    setScope(undefined);
    setInterpretation(null);
    setErrorMsg("");
    setClarify("");
    setLastRefine(null);
    setQueuePosition(0);
    setShowTrafficWarning(false);

    // A failed refine leaves the build as it was, and says so.
    const isRefine = Boolean(previousIntent);
    const failureText = (text) => (isRefine && !/not changed/i.test(text) ? `${text} Your build was not changed.` : text);
    const snapshot = isRefine ? {
      build, explanation, warnings, notes, power, previousIntent, previousBuild, removedCategories,
      validatedSignature: validatedSignatureRef.current,
      versionId: currentVersionId,
    } : null;

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        message,
        site,
        customKeys,
        ...(previousIntent && { previousIntent }),
        ...(previousBuild && { previousBuild }),
        ...(previousIntent && removedCategories.length > 0 && { removedCategories }),
      };

      const submitRes = await axios.post(`${apiBaseUrl}/api/build`, payload, { signal: controller.signal });
      if (currentRequestId !== requestIdRef.current) return;

      if (submitRes.data.error) {
        setErrorMsg(failureText(submitRes.data.error));
        setLoadingState("error");
        return;
      }

      const { jobId, position } = submitRes.data;
      setQueuePosition(position);
      if (position > 3) setShowTrafficWarning(true);

      pollRef.current = setInterval(async () => {
        if (currentRequestId !== requestIdRef.current) {
          stopPolling();
          return;
        }
        try {
          const { data } = await axios.get(`${apiBaseUrl}/api/build/${jobId}`);
          if (currentRequestId !== requestIdRef.current) return;

          if (data.status === 'queued') {
            setQueuePosition(data.position || 1);
            if (data.position > 3) setShowTrafficWarning(true);
          }

          if (data.status === 'processing') {
            setQueuePosition(0);
            if ('scope' in data) setScope(data.scope);
            if (data.interpretation) setInterpretation(data.interpretation);
            if (data.stage) {
              setStage(data.stage);
              setLoadingState(STAGE_TO_STATE[data.stage] || "analyzing");
            }
          }

          if (data.status === 'completed' && data.result) {
            const result = data.result;
            const nextBuild = { ...INITIAL_BUILD, ...result.build };
            stopPolling();
            // The server just validated exactly this build.
            validatedSignatureRef.current = buildSignature(nextBuild);
            setBuild(nextBuild);
            setExplanation(result.explanation);
            setWarnings(result.warnings || []);
            setNotes(result.notes ?? (result.warnings || []).filter((w) => !String(w).includes('INCOMPATIBLE')));
            setPower(result.power || null);
            setPreviousIntent(result.intent || null);
            setPreviousBuild(result.build || null);
            if (snapshot) {
              refineSnapshotRef.current = snapshot;
              setLastRefine({
                ...diffBuilds(snapshot.build, nextBuild, Object.keys(INITIAL_BUILD)),
                message,
                interpretation: result.interpretation || null,
              });
            } else {
              refineSnapshotRef.current = null;
            }
            const version = {
              id: Date.now(),
              label: message.trim().slice(0, 120),
              total: sumBuild(nextBuild),
              at: new Date().toISOString(),
              session: {
                build: result.build || {},
                explanation: result.explanation,
                warnings: result.warnings || [],
                notes: result.notes ?? (result.warnings || []).filter((w) => !String(w).includes('INCOMPATIBLE')),
                power: result.power || null,
                previousIntent: result.intent || null,
                previousBuild: result.build || null,
              },
            };
            // A fresh build starts a new list; a refine adds to it. A build opened from a link or an
            // older saved session has no list yet, so the build it refined becomes the first entry.
            setVersions((prev) => {
              if (!snapshot) return [version];
              const base = prev.length > 0 ? prev : [{
                id: version.id - 1,
                label: 'Your build before changes',
                total: sumBuild(snapshot.build),
                at: version.at,
                session: {
                  build: Object.fromEntries(Object.entries(snapshot.build).filter(([, item]) => item)),
                  explanation: snapshot.explanation,
                  warnings: snapshot.warnings,
                  notes: snapshot.notes,
                  power: snapshot.power,
                  previousIntent: snapshot.previousIntent,
                  previousBuild: snapshot.previousBuild,
                },
              }];
              return [...base, version].slice(-MAX_VERSIONS);
            });
            setCurrentVersionId(version.id);
            setScope(undefined);
            setInterpretation(null);
            // The engine honored the removals; its intent now records them as not required.
            setRemovedCategories([]);
            setLoadingState("success");
            setStage(null);
            setQueuePosition(0);
            setShowTrafficWarning(false);
            if (onSuccess) onSuccess();
            showToast("Build ready");
          }

          if (data.status === 'failed') {
            stopPolling();
            setScope(undefined);
            setInterpretation(null);
            if (data.errorCode === 'NEEDS_CLARIFICATION' && data.error) {
              // Not a failure: the message did not say what to change. The build stays as it is.
              setClarify(data.error);
              setLoadingState("idle");
            } else {
              setErrorMsg(failureText(data.error || "Build failed unexpectedly."));
              setLoadingState("error");
            }
            setStage(null);
            setQueuePosition(0);
          }
        } catch (pollErr) {
          if (axios.isCancel(pollErr)) stopPolling();
          // transient network errors: keep polling
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || axios.isCancel(err)) {
        setLoadingState("idle");
        return;
      }
      if (err.response?.status === 429) {
        setErrorMsg(failureText("You've reached the free tier limit. Wait 15 minutes, or paste your own free Groq API key in Settings to continue immediately."));
      } else {
        setErrorMsg(failureText(err.response?.data?.error || "Failed to connect to the AI builder engine."));
      }
      setLoadingState("error");
    }
  }, [
    apiBaseUrl, site, customKeys, previousIntent, previousBuild, removedCategories, isBusy,
    build, explanation, warnings, notes, power, currentVersionId,
    cancelInFlight, stopPolling, showToast,
  ]);

  return {
    build,
    total,
    explanation,
    warnings,
    notes,
    power,
    previousIntent,
    loadingState,
    stage,
    scope,
    interpretation,
    lastRefine,
    clarify,
    versions,
    currentVersionId,
    isBusy,
    errorMsg,
    queuePosition,
    showTrafficWarning,
    submit,
    stop,
    clear,
    removePart,
    swapPart,
    dismissTrafficWarning,
    dismissRefine,
    dismissClarify,
    undoRefine,
    restoreVersion,
  };
}
