import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { INITIAL_BUILD, BUSY_STATES } from '../lib/constants';
import { sumBuild } from '../lib/format';

const SESSION_KEY = 'buildmypc.session.v1';
const POLL_INTERVAL_MS = 3000;

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

/**
 * Owns the build session: parts, warnings, AI job lifecycle (submit, poll, stop),
 * persistence across refresh, and remove/undo.
 *
 * @param {object} opts
 * @param {string} opts.site - retailer key or custom URL
 * @param {{groq: string, ollama: string, provider: string}} opts.customKeys
 * @param {(message: string, action?: {label: string, onClick: () => void}) => void} opts.showToast
 * @param {() => void} opts.dismissToast
 */
export function useBuild({ site, customKeys, showToast, dismissToast }) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const [savedSession] = useState(loadSavedSession);

  const [build, setBuild] = useState(() => ({ ...INITIAL_BUILD, ...(savedSession?.build || {}) }));
  const [explanation, setExplanation] = useState(savedSession?.explanation || "");
  const [warnings, setWarnings] = useState(savedSession?.buildWarnings || []);
  const [previousIntent, setPreviousIntent] = useState(savedSession?.previousIntent || null);
  const [previousBuild, setPreviousBuild] = useState(savedSession?.previousBuild || null);

  const [loadingState, setLoadingState] = useState("idle"); // idle | analyzing | selecting | checking | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [queuePosition, setQueuePosition] = useState(0);
  const [showTrafficWarning, setShowTrafficWarning] = useState(false);

  const pollRef = useRef(null);
  const loadingTimersRef = useRef([]);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const total = useMemo(() => sumBuild(build), [build]);
  const isBusy = BUSY_STATES.includes(loadingState);

  const clearLoadingTimers = useCallback(() => {
    loadingTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    loadingTimersRef.current = [];
  }, []);

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
    clearLoadingTimers();
    // Invalidate any request that is still resolving.
    requestIdRef.current += 1;
  }, [stopPolling, clearLoadingTimers]);

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
        build, explanation, buildWarnings: warnings, previousIntent, previousBuild,
      }));
    } catch {
      // storage unavailable (private mode / quota) — session just won't persist
    }
  }, [build, explanation, warnings, previousIntent, previousBuild]);

  const clear = useCallback(() => {
    cancelInFlight();
    setBuild(INITIAL_BUILD);
    setExplanation("");
    setErrorMsg("");
    setWarnings([]);
    setLoadingState("idle");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    setPreviousIntent(null);
    setPreviousBuild(null);
    showToast("Build cleared");
  }, [cancelInFlight, showToast]);

  const stop = useCallback(() => {
    cancelInFlight();
    setLoadingState("idle");
    setErrorMsg("");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    showToast("Build generation stopped");
  }, [cancelInFlight, showToast]);

  const removePart = useCallback((category) => {
    const removed = build[category];
    if (!removed) return;
    setBuild((prev) => ({ ...prev, [category]: null }));
    showToast(`Removed ${category}`, {
      label: 'Undo',
      onClick: () => {
        setBuild((prev) => (prev[category] ? prev : { ...prev, [category]: removed }));
        dismissToast();
      },
    });
  }, [build, showToast, dismissToast]);

  const dismissTrafficWarning = useCallback(() => setShowTrafficWarning(false), []);

  /**
   * @param {string} message - the user's prompt
   * @param {() => void} [onSuccess] - called when the build completes
   */
  const submit = useCallback(async (message, onSuccess) => {
    if (!message.trim() || isBusy) return;

    cancelInFlight();
    setLoadingState("analyzing");
    setErrorMsg("");
    setQueuePosition(0);
    setShowTrafficWarning(false);

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
      };

      const submitRes = await axios.post(`${apiBaseUrl}/api/build`, payload, { signal: controller.signal });
      if (currentRequestId !== requestIdRef.current) return;

      if (submitRes.data.error) {
        setErrorMsg(submitRes.data.error);
        setLoadingState("error");
        return;
      }

      const { jobId, position } = submitRes.data;
      setQueuePosition(position);
      if (position > 3) setShowTrafficWarning(true);

      // Stage labels are time-based until the API reports real stages (Phase 3).
      const selectTimer = setTimeout(() => {
        setLoadingState((prev) => (BUSY_STATES.includes(prev) ? "selecting" : prev));
      }, 1500);
      const checkTimer = setTimeout(() => {
        setLoadingState((prev) => (BUSY_STATES.includes(prev) ? "checking" : prev));
      }, 3000);
      loadingTimersRef.current = [selectTimer, checkTimer];

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
          }

          if (data.status === 'completed' && data.result) {
            stopPolling();
            clearLoadingTimers();
            setBuild({ ...INITIAL_BUILD, ...data.result.build });
            setExplanation(data.result.explanation);
            setWarnings(data.result.warnings || []);
            setPreviousIntent(data.result.intent || null);
            setPreviousBuild(data.result.build || null);
            setLoadingState("success");
            setQueuePosition(0);
            setShowTrafficWarning(false);
            if (onSuccess) onSuccess();
            showToast("Build ready");
          }

          if (data.status === 'failed') {
            stopPolling();
            clearLoadingTimers();
            setErrorMsg(data.error || "Build failed unexpectedly.");
            setLoadingState("error");
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
        clearLoadingTimers();
        return;
      }
      if (err.response?.status === 429) {
        setErrorMsg("You've reached the free tier limit. Wait 15 minutes, or paste your own free Groq API key in Settings to continue immediately.");
      } else {
        setErrorMsg(err.response?.data?.error || "Failed to connect to the AI builder engine.");
      }
      setLoadingState("error");
      clearLoadingTimers();
    }
  }, [
    apiBaseUrl, site, customKeys, previousIntent, previousBuild, isBusy,
    cancelInFlight, stopPolling, clearLoadingTimers, showToast,
  ]);

  return {
    build,
    total,
    explanation,
    warnings,
    previousIntent,
    loadingState,
    isBusy,
    errorMsg,
    queuePosition,
    showTrafficWarning,
    submit,
    stop,
    clear,
    removePart,
    dismissTrafficWarning,
  };
}
