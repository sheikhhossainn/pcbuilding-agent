import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { pollJob } from '../lib/pollJob';
import { crossCheckSignature, toCrossCheckBuild } from '../lib/crossCheck';

const IDLE = { status: 'idle', progress: {}, data: null, error: '', signature: null };

/**
 * Prices the working build at every other store (POST /api/build/cross-check, then polls).
 * Results remember which build they were made for: when the build or store changes they are
 * marked stale instead of being thrown away, so the panel can offer to run again.
 *
 * @param {{ build: object, intent: object|null, site: string|null }} opts
 * @returns {{ status: 'idle'|'running'|'done'|'error', progress: object, data: object|null,
 *   error: string, stale: boolean, run: () => void, cancel: () => void }}
 */
export function useCrossCheck({ build, intent, site }) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);
  const signature = useMemo(() => crossCheckSignature(build, site), [build, site]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async () => {
    if (!site) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...IDLE, status: 'running', signature });

    try {
      const { data: submitted } = await axios.post(`${apiBaseUrl}/api/build/cross-check`, {
        build: toCrossCheckBuild(build),
        intent,
        site,
      }, { signal: controller.signal });

      const fetchStatus = () => axios
        .get(`${apiBaseUrl}/api/build/${submitted.jobId}`, { signal: controller.signal })
        .then((r) => r.data);
      const final = await pollJob(fetchStatus, {
        signal: controller.signal,
        intervalMs: 500,
        onUpdate: (data) => {
          if (data.progress) setState((prev) => ({ ...prev, progress: data.progress }));
        },
      });
      if (!final || controller.signal.aborted) return;

      if (final.status === 'completed') {
        setState((prev) => ({ ...prev, status: 'done', data: final.result, progress: final.progress || prev.progress }));
      } else {
        setState((prev) => ({ ...prev, status: 'error', error: final.error || 'The check failed. Please try again.' }));
      }
    } catch (err) {
      if (axios.isCancel(err) || controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err.response?.data?.error || "Couldn't reach the server. Check your connection and try again.",
      }));
    }
  }, [apiBaseUrl, build, intent, site, signature]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState(IDLE);
  }, []);

  const stale = state.status !== 'idle' && state.signature !== signature;
  return { ...state, stale, run, cancel };
}
