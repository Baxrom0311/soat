import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isAudioBlocked, playAlert, playConfirmation, resetForTests, subscribe, unlockAudio } from './alarm';

/** Minimal stand-in for the parts of AudioContext this module touches. jsdom has no
 *  Web Audio, and the behaviour worth pinning here is the blocked/allowed decision,
 *  not the waveform. */
function installAudioContext(initialState: AudioContextState) {
  const nodes = { started: 0 };
  const ctx = {
    state: initialState,
    currentTime: 0,
    onstatechange: null as null | (() => void),
    resume: vi.fn(async () => {
      ctx.state = 'running';
      ctx.onstatechange?.();
    }),
    createOscillator: () => ({
      type: '',
      frequency: { value: 0 },
      connect: () => {},
      disconnect: () => {},
      start: () => {
        nodes.started += 1;
      },
      stop: () => {},
      onended: null,
    }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    destination: {},
  };
  (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => ctx);
  return { ctx, nodes };
}

beforeEach(() => {
  resetForTests();
  vi.useRealTimers();
});

describe('alarm', () => {
  test('a context the browser has suspended counts as blocked', () => {
    installAudioContext('suspended');
    expect(isAudioBlocked()).toBe(true);
  });

  test('a running context is not blocked', () => {
    installAudioContext('running');
    expect(isAudioBlocked()).toBe(false);
  });

  test('a browser with no Web Audio at all counts as blocked rather than throwing', () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    expect(isAudioBlocked()).toBe(true);
    expect(playAlert()).toBe(false);
  });

  test('playAlert reports failure when blocked, so silence is never mistaken for an alert', () => {
    const { nodes } = installAudioContext('suspended');
    expect(playAlert()).toBe(false);
    expect(nodes.started).toBe(0);
  });

  test('playAlert sounds three pulses when allowed', () => {
    const { nodes } = installAudioContext('running');
    expect(playAlert()).toBe(true);
    expect(nodes.started).toBe(3);
  });

  test('a second alert inside the guard window does not double up', () => {
    // A new-call websocket event and the repeat timer can land together; two overlapping
    // patterns read as noise rather than as two calls.
    const { nodes } = installAudioContext('running');
    playAlert();
    playAlert();
    expect(nodes.started).toBe(3);
  });

  test('unlockAudio resumes the context and tells subscribers it is no longer blocked', async () => {
    const { ctx } = installAudioContext('suspended');
    const seen: boolean[] = [];
    subscribe(() => seen.push(isAudioBlocked()));

    expect(isAudioBlocked()).toBe(true);
    await unlockAudio();

    expect(ctx.resume).toHaveBeenCalled();
    expect(isAudioBlocked()).toBe(false);
    expect(seen).toContain(false);
  });

  test('a context the browser unblocks on its own still notifies, without unlockAudio', () => {
    // Any click anywhere on the page can flip this; the prompt must stop showing.
    const { ctx } = installAudioContext('suspended');
    const seen: boolean[] = [];
    subscribe(() => seen.push(isAudioBlocked()));
    isAudioBlocked(); // create the context so onstatechange is wired

    ctx.state = 'running';
    ctx.onstatechange?.();

    expect(seen).toContain(false);
  });

  test('unlocking makes a sound, so a working click is distinguishable from a dead one', async () => {
    // Switching sound on is the one action whose purpose is otherwise inaudible: with no
    // confirmation the button looks broken even when it worked, which is how this was
    // first reported from the ward.
    const { nodes } = installAudioContext('suspended');
    const ok = await unlockAudio();
    expect(ok).toBe(true);
    expect(nodes.started).toBeGreaterThan(0);
  });

  test('the confirmation is a different pattern from the alert', () => {
    // Two notes, not the alert's three: confirming the speakers must never be mistaken
    // across a ward for a patient calling.
    const { nodes } = installAudioContext('running');
    expect(playConfirmation()).toBe(true);
    expect(nodes.started).toBe(2);
  });

  test('the confirmation ignores the repeat guard, since it answers a click', () => {
    const { nodes } = installAudioContext('running');
    playConfirmation();
    playConfirmation();
    expect(nodes.started).toBe(4);
  });

  test('a failed unlock reports false and stays silent', async () => {
    const { ctx, nodes } = installAudioContext('suspended');
    ctx.resume = vi.fn(async () => {
      throw new Error('not allowed');
    });
    expect(await unlockAudio()).toBe(false);
    expect(nodes.started).toBe(0);
  });

  test('unlockAudio on a browser that refuses to resume leaves it reported as blocked', async () => {
    const { ctx } = installAudioContext('suspended');
    ctx.resume = vi.fn(async () => {
      throw new Error('not allowed');
    });
    await unlockAudio();
    expect(isAudioBlocked()).toBe(true);
  });
});
