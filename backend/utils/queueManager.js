/**
 * Queue Manager — In-memory job queue for PC builds
 * Jobs Map: jobId → { status, payload, result, error, timestamps }
 * Pending[]: ordered array of jobIds waiting to be processed
 * Workers: N persistent async loops, each holding one Groq key
 * Statuses: queued → processing → completed | failed
 *
 * Lanes: work that needs no AI key (cross-checks) runs in its own lane with its own concurrency,
 * so it neither waits behind AI builds nor holds up their workers. Lanes share the job map, so one
 * status endpoint serves every kind of job.
 */

import { randomUUID } from 'crypto';

const jobs = new Map();
const pending = [];
const workers = [];
let buildFn = null;
let depsFactory = null;

// Purge completed/failed jobs after 10 min
const JOB_TTL_MS = 10 * 60 * 1000;

// More waiting builds than this means the workers are far behind; fail fast instead of
// letting the queue (and every client's wait) grow without bound.
export const MAX_PENDING_JOBS = 200;
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
export function createJob(payload, { lane = null } = {}) {
  if (lane) return createLaneJob(lane, payload);
  if (pending.length >= MAX_PENDING_JOBS) {
    const error = new Error('The build queue is full. Please try again in a minute.');
    error.code = 'QUEUE_FULL';
    throw error;
  }
  const jobId = randomUUID();
  jobs.set(jobId, {
    status: 'queued',
    payload,
    result: null,
    error: null,
    stage: null,
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
    const pos = (job.lane ? lanes.get(job.lane)?.pending : pending).indexOf(jobId) + 1;
    response.position = pos > 0 ? pos : 1;
    response.estimatedWait = response.position * 12;
  }
  // Per-part progress of a lane job (cross-check: store -> queued | matching | building | done | failed).
  if (job.progress) response.progress = job.progress;
  if (job.status === 'processing') {
    response.position = 0;
    response.estimatedWait = 0;
    // Which pipeline step the worker is on: intent | planning | selecting | optimizing | checking | explaining
    response.stage = job.stage;
    // Refine only. Absent = not known yet; an array = the parts being searched again; null = all of them.
    if (job.scope !== undefined) response.scope = job.scope;
    // Refine only: how the message was understood, as chips.
    if (job.interpretation) response.interpretation = job.interpretation;
  }
  if (job.status === 'completed') response.result = job.result;
  if (job.status === 'failed') {
    response.error = job.error;
    if (job.errorCode) response.errorCode = job.errorCode;
  }

  return response;
}

/** Get current queue depth */
export function getQueueDepth() {
  return pending.length;
}

/**
 * Initialize the worker pool
 * @param {Object} opts
 * @param {Function} opts.buildFn - async (payload, deps, { onStage }) => result
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
    const customKey = job.payload.customKeys?.ollama || job.payload.customKeys?.groq;
    const provider = job.payload.customKeys?.ollama ? 'ollama' : (job.payload.customKeys?.provider || process.env.AI_PROVIDER || 'ollama');
    const apiKey = customKey || worker.groqKey;
    const deps = depsFactory({ key: apiKey, provider });
    const result = await buildFn(job.payload, deps, {
      onStage: (stage) => { job.stage = stage; },
      onScope: (changing) => { job.scope = changing; },
      onInterpretation: (items) => { job.interpretation = items; },
    });
    job.status = 'completed';
    job.result = result;
  } catch (err) {
    console.error(`[queue] Worker ${worker.id} failed job ${jobId.slice(0, 8)}:`, err.message);
    job.status = 'failed';
    // Only errors written for users reach the client; internals stay in the server log.
    job.error = err.userMessage || 'Build failed unexpectedly. Please try again.';
    // Lets the client tell "your message needs a question answered" from a real failure.
    if (err.userMessage && err.code === 'NEEDS_CLARIFICATION') job.errorCode = err.code;
  } finally {
    job.completedAt = Date.now();
    worker.busy = false;
    console.log(`[queue] Worker ${worker.id} finished ${jobId.slice(0, 8)} (${job.status}) in ${job.completedAt - job.startedAt}ms`);
    tickWorkers();
  }
}

// ─── Lanes ───

const lanes = new Map();

/**
 * Register a lane for jobs that need no AI key.
 * @param {string} name
 * @param {{ run: (payload: object, ctx: object) => Promise<object>, concurrency?: number }} opts
 *   run gets ctx.onProgress(key, state) to report partial progress
 */
export function registerLane(name, { run, concurrency = 2 }) {
  lanes.set(name, { run, concurrency, active: 0, pending: [] });
}

function createLaneJob(name, payload) {
  const lane = lanes.get(name);
  if (!lane) throw new Error(`Unknown queue lane: ${name}`);
  if (lane.pending.length >= MAX_PENDING_JOBS) {
    const error = new Error('Too many requests are waiting. Please try again in a minute.');
    error.code = 'QUEUE_FULL';
    throw error;
  }
  const jobId = randomUUID();
  jobs.set(jobId, {
    status: 'queued', lane: name, payload, result: null, error: null, stage: null, progress: null,
    createdAt: Date.now(), startedAt: null, completedAt: null,
  });
  lane.pending.push(jobId);
  tickLane(lane);
  return { jobId, position: lane.pending.indexOf(jobId) + 1 };
}

function tickLane(lane) {
  while (lane.active < lane.concurrency && lane.pending.length > 0) {
    const jobId = lane.pending.shift();
    const job = jobs.get(jobId);
    if (!job || job.status !== 'queued') continue;
    lane.active += 1;
    runLaneJob(lane, jobId, job);
  }
}

async function runLaneJob(lane, jobId, job) {
  job.status = 'processing';
  job.startedAt = Date.now();
  try {
    job.result = await lane.run(job.payload, {
      onProgress: (key, state) => { job.progress = { ...(job.progress || {}), [key]: state }; },
    });
    job.status = 'completed';
  } catch (err) {
    console.error(`[queue] ${job.lane} job ${jobId.slice(0, 8)} failed:`, err.message);
    job.status = 'failed';
    job.error = err.userMessage || 'Something went wrong. Please try again.';
  } finally {
    job.completedAt = Date.now();
    lane.active -= 1;
    tickLane(lane);
  }
}
