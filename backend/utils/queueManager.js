/**
 * Queue Manager — In-memory job queue for PC builds
 * Jobs Map: jobId → { status, payload, result, error, timestamps }
 * Pending[]: ordered array of jobIds waiting to be processed
 * Workers: N persistent async loops, each holding one Groq key
 * Statuses: queued → processing → completed | failed
 */

import { randomUUID } from 'crypto';

const jobs = new Map();
const pending = [];
const workers = [];
let buildFn = null;
let depsFactory = null;

// Purge completed/failed jobs after 10 min
const JOB_TTL_MS = 10 * 60 * 1000;
function purgeStaleJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === 'completed' || job.status === 'failed') && job.completedAt) {
      if (now - job.completedAt > JOB_TTL_MS) jobs.delete(id);
    }
  }
}
setInterval(purgeStaleJobs, 2 * 60 * 1000).unref();

/**
 * Create a new build job and enqueue it
 * @param {Object} payload - { message, site, customKeys }
 * @returns {{ jobId: string, position: number, estimatedWait: number }}
 */
export function createJob(payload) {
  const jobId = randomUUID();
  jobs.set(jobId, {
    status: 'queued',
    payload,
    result: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  });
  pending.push(jobId);
  tickWorkers();
  const position = pending.indexOf(jobId) + 1;
  return { jobId, position, estimatedWait: position * 12 };
}

/**
 * Get the current status of a job
 * @param {string} jobId
 * @returns {Object|null}
 */
export function getJobStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;

  const response = { status: job.status, createdAt: job.createdAt };

  if (job.status === 'queued') {
    const pos = pending.indexOf(jobId) + 1;
    response.position = pos > 0 ? pos : 1;
    response.estimatedWait = response.position * 12;
  }
  if (job.status === 'processing') {
    response.position = 0;
    response.estimatedWait = 0;
  }
  if (job.status === 'completed') response.result = job.result;
  if (job.status === 'failed') response.error = job.error;

  return response;
}

/** Get current queue depth */
export function getQueueDepth() {
  return pending.length;
}

/**
 * Initialize the worker pool
 * @param {Object} opts
 * @param {Function} opts.buildFn - async (payload, deps) => result
 * @param {Function} opts.depsFactory - (groqApiKey) => deps object
 * @param {string[]} opts.groqKeys - Array of Groq API keys
 */
export function initWorkers({ buildFn: fn, depsFactory: df, groqKeys }) {
  buildFn = fn;
  depsFactory = df;
  const validKeys = groqKeys.filter(Boolean);
  if (validKeys.length === 0) {
    console.error('[queue] No Groq keys — workers will not start');
    return;
  }
  for (let i = 0; i < validKeys.length; i++) {
    workers.push({ id: i + 1, busy: false, groqKey: validKeys[i] });
  }
  console.log(`[queue] ✓ Initialized ${workers.length} worker(s)`);
}

function tickWorkers() {
  for (const worker of workers) {
    if (!worker.busy && pending.length > 0) processNext(worker);
  }
}

async function processNext(worker) {
  if (pending.length === 0) return;
  const jobId = pending.shift();
  const job = jobs.get(jobId);
  if (!job || job.status !== 'queued') { tickWorkers(); return; }

  worker.busy = true;
  job.status = 'processing';
  job.startedAt = Date.now();
  console.log(`[queue] Worker ${worker.id} processing job ${jobId.slice(0, 8)}...`);

  try {
    const groqKey = job.payload.customKeys?.groq || worker.groqKey;
    const deps = depsFactory(groqKey);
    const result = await buildFn(job.payload, deps);
    job.status = 'completed';
    job.result = result;
  } catch (err) {
    console.error(`[queue] Worker ${worker.id} failed job ${jobId.slice(0, 8)}:`, err.message);
    job.status = 'failed';
    job.error = err.userMessage || err.message || 'Build failed unexpectedly.';
  } finally {
    job.completedAt = Date.now();
    worker.busy = false;
    console.log(`[queue] Worker ${worker.id} finished ${jobId.slice(0, 8)} (${job.status}) in ${job.completedAt - job.startedAt}ms`);
    tickWorkers();
  }
}
