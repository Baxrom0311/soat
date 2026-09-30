/** The audible half of the call alert, for a dashboard left open on a screen.
 *
 * Three things this owns that a bare `new AudioContext()` per beep did not:
 *
 *  - **Blocked-ness is observable.** Browsers refuse to play audio until the page has
 *    been interacted with, and the previous code swallowed that in a catch. On a kiosk
 *    nobody clicks, so the very first alert was silent and there was no way to find out
 *    — the worst failure this system can have is the one that looks like silence
 *    because nothing is happening. `subscribe()` lets the UI show it and offer a fix.
 *
 *  - **One context for the session.** Browsers cap concurrent AudioContexts, so a
 *    context per beep eventually stops producing sound on a long-lived display.
 *
 *  - **A pattern, not a blip.** Three pulses carry across a room; a single 0.35s tone
 *    at a nurses' station does not.
 */

type Listener = () => void;

let ctx: AudioContext | null = null;
const listeners = new Set<Listener>();

/** Guards against a new-call event and the repeat timer firing on top of each other. */
let lastPlayedAt = 0;
const MIN_GAP_MS = 3000;

function notify() {
  for (const fn of listeners) fn();
}

function context(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx || ctx.state === 'closed') {
      ctx = new Ctor();
      // Chrome flips this to "running" on the first gesture even without an explicit
      // resume(), so the indicator has to follow the context rather than our own flag.
      ctx.onstatechange = notify;
    }
    return ctx;
  } catch {
    return null;
  }
}

/** True when the browser will not make sound yet. Drives the "turn sound on" prompt. */
export function isAudioBlocked(): boolean {
  const c = context();
  return c === null || c.state !== 'running';
}

/** Must be called from inside a real user gesture (click/keydown) or it has no effect. */
export async function unlockAudio(): Promise<void> {
  const c = context();
  if (!c) return;
  try {
    await c.resume();
  } catch {
    // Nothing more to try: the indicator stays in its "blocked" state, which is the
    // honest answer rather than a silent failure.
  }
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function pulse(c: AudioContext, startAt: number, freq: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  // Ramp instead of a hard stop: an abrupt cut produces an audible click on most
  // speakers, which over hundreds of repeats a day is worse than the tone itself.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
  osc.start(startAt);
  osc.stop(startAt + 0.2);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Three rising pulses. Returns false when the browser refused to make sound, so the
 *  caller can surface it rather than assume the ward was alerted. */
export function playAlert(): boolean {
  const c = context();
  if (!c || c.state !== 'running') return false;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return true;
  lastPlayedAt = now;
  const t = c.currentTime;
  pulse(c, t, 880);
  pulse(c, t + 0.25, 880);
  pulse(c, t + 0.5, 1175);
  return true;
}

/** Test seam: forget the session's context and listeners. */
export function resetForTests() {
  ctx = null;
  listeners.clear();
  lastPlayedAt = 0;
}
