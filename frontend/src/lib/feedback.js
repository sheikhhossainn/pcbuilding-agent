/**
 * Sound and haptic feedback for the moments that matter (build ready, swap, copy, remove,
 * error, a cheaper store found). Every sound is synthesized with Web Audio: no files to fetch,
 * nothing to license, and each one is a short soft envelope under ~200 ms.
 *
 * Rules:
 * - No AudioContext exists until the user's first click or key press (browser autoplay rules,
 *   and a page should never make noise on its own when it loads).
 * - At most one sound per THROTTLE_MS, and none while the tab is hidden.
 * - Sound is never the only signal: every event also has visible text.
 */

export const THROTTLE_MS = 80;
const MASTER_GAIN = 0.5;

/**
 * A sound is a list of notes. `slide` bends the pitch to that frequency over the note.
 * `at` is the start offset in seconds, `dur` the decay length, `gain` the peak (0..1).
 */
export const SOUNDS = {
  // Two-note rising chime.
  success: [
    { freq: 659.25, at: 0, dur: 0.22, gain: 0.12 },
    { freq: 987.77, at: 0.075, dur: 0.3, gain: 0.1 },
  ],
  // Soft upward tick.
  swap: [{ freq: 880, slide: 1320, at: 0, dur: 0.07, gain: 0.09 }],
  // Bright tink with a quiet overtone.
  copy: [
    { freq: 1567.98, at: 0, dur: 0.09, gain: 0.07 },
    { freq: 3135.96, at: 0, dur: 0.05, gain: 0.02 },
  ],
  // Low muted thock.
  remove: [{ freq: 220, slide: 140, type: 'triangle', at: 0, dur: 0.1, gain: 0.12 }],
  // Two-note falling, quieter than success.
  error: [
    { freq: 523.25, type: 'triangle', at: 0, dur: 0.14, gain: 0.07 },
    { freq: 392, type: 'triangle', at: 0.09, dur: 0.2, gain: 0.07 },
  ],
  // Rising major triad: a cheaper store was found.
  reward: [
    { freq: 1046.5, at: 0, dur: 0.18, gain: 0.07 },
    { freq: 1318.51, at: 0.05, dur: 0.2, gain: 0.07 },
    { freq: 1567.98, at: 0.1, dur: 0.32, gain: 0.08 },
  ],
};

export const HAPTICS = {
  success: [8, 40, 12],
  swap: 8,
  copy: 8,
  remove: 10,
  error: [10, 40, 10],
  reward: [8, 30, 8, 30, 8],
};

/**
 * Feedback engine with every browser dependency injectable, so it can be tested in Node.
 *
 * @param {{
 *   createContext?: () => AudioContext|null,
 *   now?: () => number,
 *   isHidden?: () => boolean,
 *   vibrate?: (pattern: number|number[]) => void,
 * }} deps
 */
export function createFeedback({
  createContext = defaultContext,
  now = () => Date.now(),
  isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  vibrate = defaultVibrate,
} = {}) {
  let ctx = null;
  let master = null;
  let unlocked = false;
  let lastAt = -Infinity;
  const prefs = { sound: true, haptics: true };

  /** Called from a user gesture. Creates (or resumes) the audio context. */
  function unlock() {
    unlocked = true;
    if (!prefs.sound) return;
    if (!ctx) {
      ctx = createContext();
      if (!ctx) return;
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume?.();
  }

  function playNotes(notes) {
    const t0 = ctx.currentTime + 0.005;
    for (const note of notes) {
      const start = t0 + note.at;
      const end = start + note.dur;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.type || 'sine';
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.slide) osc.frequency.exponentialRampToValueAtTime(note.slide, start + note.dur * 0.6);
      // Fast attack, exponential decay: the shape of a struck, not bowed, sound.
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(note.gain, start + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  /**
   * @param {keyof SOUNDS} kind
   * @returns {boolean} whether a sound was played
   */
  function play(kind) {
    const notes = SOUNDS[kind];
    if (!notes) return false;
    if (prefs.haptics && HAPTICS[kind]) vibrate(HAPTICS[kind]);
    if (!prefs.sound || !unlocked || isHidden()) return false;
    const t = now();
    if (t - lastAt < THROTTLE_MS) return false;
    if (!ctx) unlock();
    if (!ctx || ctx.state === 'closed') return false;
    lastAt = t;
    playNotes(notes);
    return true;
  }

  function setPrefs(next) {
    Object.assign(prefs, next);
    // Turning sound on from the settings toggle is itself a gesture.
    if (prefs.sound && unlocked) unlock();
  }

  return { play, unlock, setPrefs, getPrefs: () => ({ ...prefs }) };
}

function defaultContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

function defaultVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when vibrate is called without a recent gesture.
  }
}

const engine = createFeedback();

/** Play the sound and haptic for an event. Safe to call anywhere; respects the user's settings. */
export const feedback = (kind) => engine.play(kind);
export const setFeedbackPrefs = (prefs) => engine.setPrefs(prefs);

/** Creates the audio context on the first click, tap or key press. Call once at startup. */
export function installFeedbackUnlock() {
  if (typeof window === 'undefined') return;
  const opts = { capture: true, passive: true };
  const onGesture = () => {
    engine.unlock();
    window.removeEventListener('pointerdown', onGesture, opts);
    window.removeEventListener('keydown', onGesture, opts);
  };
  window.addEventListener('pointerdown', onGesture, opts);
  window.addEventListener('keydown', onGesture, opts);
}
