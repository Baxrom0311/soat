import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const getActiveCalls = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    getActiveCalls: () => getActiveCalls(),
    getCallHistory: vi.fn(async () => []),
    getUnassignedSignals: vi.fn(async () => []),
    ackCall: vi.fn(async () => ({})),
  },
  triggerBlocked: vi.fn(),
  triggerUnauthorized: vi.fn(),
  wsProtocols: (t: string) => ['bearer', t],
  wsUrl: () => 'ws://test/ws/calls',
}));

const playAlert = vi.fn(() => true);
vi.mock('../lib/alarm', () => ({
  isAudioBlocked: () => false,
  playAlert: () => playAlert(),
  playConfirmation: vi.fn(),
  subscribe: () => () => {},
  unlockAudio: vi.fn(),
}));

import { useCallsFeed } from './useCallsFeed';

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() {
    FakeSocket.all.push(this);
  }
  close() {}
  open() {
    this.onopen?.();
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
  send(msg: unknown) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
}

const call = (id: number) => ({
  call_id: id,
  room_number: `${100 + id}`,
  floor: 1,
  created_at: new Date().toISOString(),
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter factor == 1
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  getActiveCalls.mockReset().mockResolvedValue([]);
  playAlert.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCallsFeed', () => {
  test('a new call beeps exactly once, even under StrictMode', async () => {
    const { result } = renderHook(() => useCallsFeed('tok'), { wrapper: StrictMode });
    await flush();
    const ws = FakeSocket.all.at(-1)!;
    act(() => ws.open());
    await flush();

    act(() => ws.send({ type: 'new_call', call: call(1) }));
    expect(playAlert).toHaveBeenCalledTimes(1);
    expect(result.current.activeCalls.has(1)).toBe(true);

    // The same call echoed again (e.g. around a reconnect) must not beep twice.
    act(() => ws.send({ type: 'new_call', call: call(1) }));
    expect(playAlert).toHaveBeenCalledTimes(1);
  });

  test('a malformed socket message is ignored instead of throwing', async () => {
    renderHook(() => useCallsFeed('tok'));
    await flush();
    const ws = FakeSocket.all.at(-1)!;
    expect(() => act(() => ws.send('not json'))).not.toThrow();
  });

  test('the tab title carries the waiting count', async () => {
    const { unmount } = renderHook(() => useCallsFeed('tok'));
    await flush();
    const ws = FakeSocket.all.at(-1)!;
    act(() => ws.send({ type: 'new_call', call: call(1) }));
    act(() => ws.send({ type: 'new_call', call: call(2) }));
    expect(document.title).toBe('(2) Chaqiruv — NurseCall');
    act(() => ws.send({ type: 'ack', call_id: 1 }));
    act(() => ws.send({ type: 'ack', call_id: 2 }));
    expect(document.title).toBe('NurseCall — Bemor chaqiruv paneli');
    unmount();
  });

  test('reconnects with growing delays and resets after a successful open', async () => {
    renderHook(() => useCallsFeed('tok'));
    await flush();
    expect(FakeSocket.all).toHaveLength(1);

    act(() => FakeSocket.all[0].drop());
    act(() => vi.advanceTimersByTime(1999));
    expect(FakeSocket.all).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSocket.all).toHaveLength(2); // after 2s

    act(() => FakeSocket.all[1].drop());
    act(() => vi.advanceTimersByTime(3999));
    expect(FakeSocket.all).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSocket.all).toHaveLength(3); // after 4s

    act(() => FakeSocket.all[2].open());
    await flush();
    act(() => FakeSocket.all[2].drop());
    act(() => vi.advanceTimersByTime(2000));
    expect(FakeSocket.all).toHaveLength(4); // back to 2s
  });

  test('polls slowly while the socket is live and fast while it is down', async () => {
    renderHook(() => useCallsFeed('tok'));
    await flush();
    const ws = FakeSocket.all[0];
    act(() => ws.open());
    await flush();
    getActiveCalls.mockClear();

    act(() => vi.advanceTimersByTime(10000));
    expect(getActiveCalls).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    expect(getActiveCalls).toHaveBeenCalledTimes(1);

    act(() => ws.drop());
    getActiveCalls.mockClear();
    act(() => vi.advanceTimersByTime(5000));
    expect(getActiveCalls).toHaveBeenCalledTimes(1);
  });

  test('a call that only the poll sees still beeps', async () => {
    renderHook(() => useCallsFeed('tok'));
    await flush(); // initial load: silent
    getActiveCalls.mockResolvedValue([call(7)]);
    act(() => vi.advanceTimersByTime(5000));
    await flush();
    expect(playAlert).toHaveBeenCalledTimes(1);
  });
});
