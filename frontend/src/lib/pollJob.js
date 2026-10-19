// Poll a queued job (build or cross-check) until it finishes.
//
// One request at a time (the next is scheduled when the last returns), stops on its own when the
// job completes or fails, and stops quietly when `signal` aborts. Network blips are retried; a job
// the server no longer knows (expired) ends as failed.

export const POLL_INTERVAL_MS = 800;
const EXPIRED = 'This request expired before it finished. Please try again.';

/**
 * @param {() => Promise<object>} fetchStatus - resolves with the job status body
 * @param {{ onUpdate?: (data: object) => void, signal?: AbortSignal, intervalMs?: number }} [opts]
 * @returns {Promise<object|null>} the final status body, or null when aborted
 */
export function pollJob(fetchStatus, { onUpdate, signal, intervalMs = POLL_INTERVAL_MS } = {}) {
  return new Promise((resolve) => {
    let timer = null;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    if (signal?.aborted) {
      finish(null);
      return;
    }
    signal?.addEventListener('abort', onAbort);

    const tick = async () => {
      try {
        const data = await fetchStatus();
        if (done) return;
        onUpdate?.(data);
        if (data?.status === 'completed' || data?.status === 'failed') {
          finish(data);
          return;
        }
      } catch (err) {
        if (done) return;
        if (err?.response?.status === 404) {
          const expired = { status: 'failed', error: EXPIRED };
          onUpdate?.(expired);
          finish(expired);
          return;
        }
        // Anything else is treated as a blip: keep polling.
      }
      if (!done) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, intervalMs);
  });
}
