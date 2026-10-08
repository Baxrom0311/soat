import { useCallback, useEffect, useRef, useState } from 'react';
import { api, triggerBlocked, triggerUnauthorized, wsProtocols, wsUrl } from '../api/client';
import type { ActiveCall, HistoryCall, UnassignedSignal, WsMessage, WsUnassignedSignal } from '../api/types';
import { isAudioBlocked, playAlert, playConfirmation, subscribe as subscribeAudio, unlockAudio } from '../lib/alarm';

export type ConnStatus = 'connecting' | 'live' | 'disconnected';

/** Poll cadence while the socket is down: the poll is then the only delivery path. */
const POLL_MS = 5000;
/** While the socket is live every change already arrives as a push, so the poll is only
 *  a reconciliation pass. Polling at 5s anyway meant each open dashboard pulled 50 rows
 *  of history 720 times an hour for nothing. */
const POLL_LIVE_MS = 15000;
/** Reconnect backoff: 2s, 4s, 8s ... capped at 30s, with jitter so every dashboard in a
 *  hospital does not hit a just-restarted server in the same instant. */
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const BASE_TITLE = 'NurseCall — Bemor chaqiruv paneli';
/** How often an unacknowledged call re-announces itself. Long enough not to become
 *  background noise somebody tunes out, short enough that a call cannot sit unnoticed
 *  through a conversation. A single beep at arrival was the previous behaviour, and a
 *  call that arrived while the room was empty stayed silent forever after. */
const REPEAT_MS = 20000;
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_SUSPENDED = 4402;

/** WS sends ev1527_code as int; REST historically serialized it as string — normalize to string. */
function normalizeWsSignal(signal: WsUnassignedSignal): UnassignedSignal {
  return {
    id: signal.id,
    ev1527_code: String(signal.ev1527_code),
    device_id: signal.device_id,
    first_seen_at: signal.first_seen_at,
    last_seen_at: signal.last_seen_at,
    seen_count: signal.seen_count,
  };
}

/**
 * Drives the active-calls/history/unassigned-signals feed for the whole session:
 * WebSocket push + 5s polling fallback.
 *
 * `blocked` == the clinic is billing-blocked. Active calls, the WS stream and ack are
 * ungated server-side and keep running regardless; history and unassigned-signals are
 * management routes that answer 402, so once we know the clinic is blocked we stop
 * asking for them rather than generating a guaranteed 402 every 5 seconds.
 */
export function useCallsFeed(token: string | null, blocked = false, role = '') {
  const [activeCalls, setActiveCalls] = useState<Map<number, ActiveCall>>(new Map());
  const [history, setHistory] = useState<HistoryCall[]>([]);
  const [unassignedSignals, setUnassignedSignals] = useState<UnassignedSignal[]>([]);
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const [audioBlocked, setAudioBlocked] = useState<boolean>(() => isAudioBlocked());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  // Poll snapshots race WS deltas: a fetch started before a WS event must not
  // overwrite the fresher state that event produced. Any WS mutation bumps this.
  const lastWsEventAt = useRef(0);
  const initialLoadDone = useRef(false);
  // Mirror of activeCalls. Deciding "is this call new, so beep" inside a setState
  // updater is a side effect React may run twice (StrictMode does), which beeped twice;
  // deciding it against this mirror keeps the updater pure.
  const callsRef = useRef<Map<number, ActiveCall>>(new Map());
  // Read through a ref so flipping to blocked doesn't tear down the WebSocket: the
  // socket and the active-call poll must survive it untouched.
  const blockedRef = useRef(blocked);
  const roleRef = useRef(role);
  useEffect(() => {
    blockedRef.current = blocked;
    roleRef.current = role;
  }, [blocked, role]);

  const commitCalls = useCallback((next: Map<number, ActiveCall>) => {
    callsRef.current = next;
    setActiveCalls(next);
  }, []);

  const refreshActive = useCallback(async () => {
    const startedAt = Date.now();
    const data = await api.getActiveCalls();
    if (lastWsEventAt.current > startedAt) return; // stale snapshot — WS already moved on
    const prev = callsRef.current;
    const next = new Map(data.map((c) => [c.call_id, c]));
    // Calls that arrive via the poll fallback (WS down) must alert too.
    if (initialLoadDone.current && [...next.keys()].some((id) => !prev.has(id))) {
      playAlert();
    }
    initialLoadDone.current = true;
    commitCalls(next);
  }, [commitCalls]);

  const refreshHistory = useCallback(async () => {
    if (blockedRef.current) return; // management route: a 402 is certain, don't ask
    const data = await api.getCallHistory(50);
    setHistory(data);
  }, []);

  const refreshUnassigned = useCallback(async () => {
    // Admin-only route (deps.require_admin). Nurses and the superadmin are both refused,
    // and the poll runs for every signed-in user every few seconds -- so without this the
    // server answered 403 to the same caller around 100 times an hour, forever, while the
    // dashboard swallowed each one and showed an empty list. Asking for something we know
    // will be refused is not a fallback, it is noise that buries real 403s in the log.
    if (roleRef.current !== 'admin') return;
    if (blockedRef.current) return; // management route: a 402 is certain, don't ask
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
    const next = new Map(callsRef.current);
    next.delete(callId);
    commitCalls(next);
    refreshHistory().catch(() => {});
  }, [refreshHistory, commitCalls]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let attempt = 0;
    const refreshAll = () => {
      refreshActive().catch(() => {});
      refreshHistory().catch(() => {});
      refreshUnassigned().catch(() => {});
    };
    refreshAll();

    function connectWs() {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl(), wsProtocols(token!));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnStatus('live');
        // Anything that happened while the socket was down was never pushed to us;
        // catch up now instead of waiting for the next poll tick.
        refreshAll();
      };
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
          // The current backend never sends 4402 (the call stream is ungated on
          // purpose), but an older server might: record the blocked flag so the UI can
          // say so, and stop reconnect-looping against a socket that will keep
          // rejecting us. Live-call delivery then falls back to the 5s /active poll,
          // which is ungated.
          triggerBlocked(true);
          return;
        }
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
        attempt += 1;
        reconnectTimer.current = window.setTimeout(connectWs, delay * (0.75 + Math.random() * 0.5));
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(evt.data) as WsMessage;
        } catch {
          return; // not ours to act on; the poll keeps the board right regardless
        }
        lastWsEventAt.current = Date.now();
        if (msg.type === 'new_call') {
          const prev = callsRef.current;
          // The poll fallback can independently observe and beep for the same call
          // right before this WS push lands (e.g. around a WS reconnect) -- only alert
          // here if this call id is genuinely new to us.
          if (!prev.has(msg.call.call_id)) playAlert();
          commitCalls(new Map(prev).set(msg.call.call_id, msg.call));
          refreshHistory().catch(() => {});
        } else if (msg.type === 'ack') {
          const next = new Map(callsRef.current);
          next.delete(msg.call_id);
          commitCalls(next);
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

    // Background tabs get their timers throttled to once a minute or worse, so a tab
    // brought back to the front may be showing a board that is a minute old.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, refreshActive, refreshHistory, refreshUnassigned, commitCalls]);

  const live = connStatus === 'live';
  useEffect(() => {
    if (!token) return;
    const pollId = window.setInterval(() => {
      refreshActive().catch(() => {});
      refreshHistory().catch(() => {});
      refreshUnassigned().catch(() => {});
    }, live ? POLL_LIVE_MS : POLL_MS);
    return () => window.clearInterval(pollId);
  }, [token, live, refreshActive, refreshHistory, refreshUnassigned]);

  // The waiting count in the tab title, so a call is visible from another tab or a
  // minimised window, where the board itself cannot be seen.
  const waitingCount = activeCalls.size;
  useEffect(() => {
    document.title = waitingCount > 0 ? `(${waitingCount}) Chaqiruv — NurseCall` : BASE_TITLE;
  }, [waitingCount]);
  useEffect(() => () => {
    document.title = BASE_TITLE;
  }, []);

  // The browser decides when audio is allowed, and it can start allowing it without us
  // asking (any click anywhere on the page counts). Following the context's own state
  // keeps the prompt from lingering after it has stopped being true.
  useEffect(() => {
    const sync = () => setAudioBlocked(isAudioBlocked());
    sync();
    return subscribeAudio(sync);
  }, []);

  // Re-announce while anything is still waiting. Driven by the set of unacknowledged
  // calls rather than by the arrival event, so it also covers the cases arrival alone
  // missed: a call that came in while audio was still blocked, a page reloaded onto a
  // ward that already has calls open, and a call nobody happened to be in the room for.
  const hasWaiting = activeCalls.size > 0;
  useEffect(() => {
    if (!hasWaiting) return;
    const id = window.setInterval(() => {
      playAlert();
    }, REPEAT_MS);
    return () => window.clearInterval(id);
  }, [hasWaiting]);

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
    audioBlocked,
    unlockAudio,
    testSound: playConfirmation,
  };
}
