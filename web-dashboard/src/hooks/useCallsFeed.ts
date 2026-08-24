import { useCallback, useEffect, useRef, useState } from 'react';
import { api, triggerSuspended, triggerUnauthorized, wsUrl } from '../api/client';
import type { ActiveCall, HistoryCall, UnassignedSignal, WsMessage, WsUnassignedSignal } from '../api/types';

export type ConnStatus = 'connecting' | 'live' | 'disconnected';

const POLL_MS = 5000;
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_SUSPENDED = 4402;

/** One shared AudioContext for the whole session: browsers cap concurrent contexts,
 * so creating one per call would eventually silence the alarm on a long-lived kiosk. */
let sharedAudioCtx: AudioContext | null = null;

function beep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') sharedAudioCtx = new AudioCtx();
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // autoplay policies may block sound until the user interacts with the page
  }
}

/** WS sends ev1527_code as int; REST historically serialized it as string — normalize to string. */
function normalizeWsSignal(signal: WsUnassignedSignal): UnassignedSignal {
  return {
    ev1527_code: String(signal.ev1527_code),
    device_id: signal.device_id,
    first_seen_at: signal.first_seen_at,
    last_seen_at: signal.last_seen_at,
    seen_count: signal.seen_count,
  };
}

/** Drives the active-calls/history/unassigned-signals feed for the whole session: WebSocket push + 5s polling fallback. */
export function useCallsFeed(token: string | null) {
  const [activeCalls, setActiveCalls] = useState<Map<number, ActiveCall>>(new Map());
  const [history, setHistory] = useState<HistoryCall[]>([]);
  const [unassignedSignals, setUnassignedSignals] = useState<UnassignedSignal[]>([]);
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  // Poll snapshots race WS deltas: a fetch started before a WS event must not
  // overwrite the fresher state that event produced. Any WS mutation bumps this.
  const lastWsEventAt = useRef(0);
  const initialLoadDone = useRef(false);

  const refreshActive = useCallback(async () => {
    const startedAt = Date.now();
    const data = await api.getActiveCalls();
    if (lastWsEventAt.current > startedAt) return; // stale snapshot — WS already moved on
    setActiveCalls((prev) => {
      const next = new Map(data.map((c) => [c.call_id, c]));
      // Calls that arrive via the poll fallback (WS down) must alert too.
      if (initialLoadDone.current) {
        for (const id of next.keys()) {
          if (!prev.has(id)) {
            beep();
            break;
          }
        }
      }
      initialLoadDone.current = true;
      return next;
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    const data = await api.getCallHistory(50);
    setHistory(data);
  }, []);

  const refreshUnassigned = useCallback(async () => {
    const startedAt = Date.now();
    const data = await api.getUnassignedSignals();
    if (lastWsEventAt.current > startedAt) return;
    setUnassignedSignals(data.map((s) => ({ ...s, ev1527_code: String(s.ev1527_code) })));
  }, []);

  // Any REST mutation that changes what refreshUnassigned()/refreshActive() would
  // return (bind/unbind a button, delete a room, etc.) must call this right after the
  // request succeeds, the same way ackCall does below -- otherwise an in-flight poll
  // GET started *before* the mutation can resolve *after* it and overwrite the fresh
  // state with stale pre-mutation data.
  const markLocalMutation = useCallback(() => {
    lastWsEventAt.current = Date.now();
  }, []);

  const ackCall = useCallback(async (callId: number) => {
    await api.ackCall(callId);
    lastWsEventAt.current = Date.now(); // local mutation: protect it from in-flight snapshots too
    setActiveCalls((prev) => {
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
    refreshHistory().catch(() => {});
  }, [refreshHistory]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    refreshActive().catch(() => {});
    refreshHistory().catch(() => {});
    refreshUnassigned().catch(() => {});

    function connectWs() {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl(token!));
      wsRef.current = ws;

      ws.onopen = () => setConnStatus('live');
      ws.onclose = (evt) => {
        setConnStatus('disconnected');
        if (cancelled) return;
        if (evt.code === WS_CLOSE_UNAUTHORIZED) {
          // Invalid/expired/wrong-role token: reconnecting with the same token would
          // just loop every 2s forever — drop the session instead.
          triggerUnauthorized();
          return;
        }
        if (evt.code === WS_CLOSE_SUSPENDED) {
          // Billing-blocked: flip to the suspended screen instead of reconnect-looping.
          triggerSuspended();
          return;
        }
        reconnectTimer.current = window.setTimeout(connectWs, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as WsMessage;
        lastWsEventAt.current = Date.now();
        if (msg.type === 'new_call') {
          setActiveCalls((prev) => {
            // The 5s poll fallback can independently observe and beep for the same
            // call right before this WS push lands (e.g. around a WS reconnect) --
            // only alert here if this call id is genuinely new to us.
            if (!prev.has(msg.call.call_id)) beep();
            return new Map(prev).set(msg.call.call_id, msg.call);
          });
          refreshHistory().catch(() => {});
        } else if (msg.type === 'ack') {
          setActiveCalls((prev) => {
            const next = new Map(prev);
            next.delete(msg.call_id);
            return next;
          });
          refreshHistory().catch(() => {});
        } else if (msg.type === 'unassigned_signal') {
          const incoming = normalizeWsSignal(msg.signal);
          setUnassignedSignals((prev) => {
            const idx = prev.findIndex((s) => s.ev1527_code === incoming.ev1527_code);
            if (idx === -1) return [incoming, ...prev];
            const next = [...prev];
            next[idx] = incoming;
            return next;
          });
        } else if (msg.type === 'unassigned_removed') {
          const code = String(msg.ev1527_code);
          setUnassignedSignals((prev) => prev.filter((s) => s.ev1527_code !== code));
        }
      };
    }
    connectWs();

    const pollId = window.setInterval(() => {
      refreshActive().catch(() => {});
      refreshHistory().catch(() => {});
      refreshUnassigned().catch(() => {});
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, refreshActive, refreshHistory, refreshUnassigned]);

  return {
    activeCalls,
    history,
    unassignedSignals,
    connStatus,
    ackCall,
    refreshActive,
    refreshHistory,
    refreshUnassigned,
    markLocalMutation,
  };
}
