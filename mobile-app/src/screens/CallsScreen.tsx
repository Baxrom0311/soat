import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ackCall, BillingNotice, Call, getActiveCalls, getBillingNotice } from '../api';
import { POLL_INTERVAL_MS } from '../config';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import BillingBanner from '../components/BillingBanner';
import { elapsedSince } from '../time';
import { isWatchConnected, resyncWatch } from '../wearSync';
import { tokens } from '../theme';

const WATCH_CHECK_MS = 30000;
const BILLING_CHECK_MS = 6 * 60 * 60 * 1000;

interface Props {
  acknowledgedBy: string;
  onLogout: () => void;
  focusCallId: number | null;
  onFocusHandled: () => void;
}

function getAgeStep(createdAtIso: string): 1 | 2 | 3 {
  const ms = Date.now() - new Date(createdAtIso).getTime();
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  if (s < tokens.call.thresholdsSec[1]) return 1;
  if (s < tokens.call.thresholdsSec[2]) return 2;
  return 3;
}

export default function CallsScreen({ acknowledgedBy, onLogout, focusCallId, onFocusHandled }: Props) {
  const { colors, mode } = useTheme();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [watchConnected, setWatchConnected] = useState<boolean | null>(null);
  const [watchSyncing, setWatchSyncing] = useState(false);
  const [billing, setBilling] = useState<BillingNotice | null>(null);
  const [billingDismissed, setBillingDismissed] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const fetchSeqRef = useRef(0);

  const fetchCalls = useCallback(async (showSpinner = false) => {
    const seq = ++fetchSeqRef.current;
    if (showSpinner) setRefreshing(true);
    try {
      const data = await getActiveCalls();
      if (seq === fetchSeqRef.current) {
        setCalls(data);
        setError(null);
      }
    } catch (e) {
      if (seq === fetchSeqRef.current) {
        setError(e instanceof Error ? e.message : "Chaqiruvlarni yuklab bo'lmadi");
      }
    } finally {
      setLoading(false);
      if (showSpinner) setRefreshing(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchCalls(false), POLL_INTERVAL_MS);
  }, [fetchCalls]);

  useEffect(() => {
    fetchCalls(false);
    startPolling();

    const tickTimer = setInterval(() => forceTick((n) => n + 1), 30000);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground =
        appState.current.match(/inactive|background/) && nextState === 'active';
      appState.current = nextState;

      if (cameToForeground) {
        fetchCalls(false);
        startPolling();
      } else if (nextState.match(/inactive|background/)) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(tickTimer);
      subscription.remove();
    };
  }, [fetchCalls, startPolling]);

  useEffect(() => {
    let checkTimer: ReturnType<typeof setInterval> | null = null;
    const updateWatchStatus = async () => {
      try {
        const ok = await isWatchConnected();
        setWatchConnected(ok);
      } catch {
        setWatchConnected(false);
      }
    };

    updateWatchStatus();
    checkTimer = setInterval(updateWatchStatus, WATCH_CHECK_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateWatchStatus();
    });

    return () => {
      if (checkTimer) clearInterval(checkTimer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let checkTimer: ReturnType<typeof setInterval> | null = null;
    const fetchBilling = async () => {
      try {
        const notice = await getBillingNotice();
        setBilling(notice);
      } catch {
        // ignore errors
      }
    };

    fetchBilling();
    checkTimer = setInterval(fetchBilling, BILLING_CHECK_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchBilling();
    });

    return () => {
      if (checkTimer) clearInterval(checkTimer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!focusCallId) return;
    const found = calls.find((c) => c.call_id === focusCallId);
    if (found) {
      onFocusHandled();
    }
  }, [focusCallId, calls, onFocusHandled]);

  const handleAck = async (callId: number) => {
    setAckingId(callId);
    try {
      await ackCall(callId, acknowledgedBy);
      setCalls((prev) => prev.filter((c) => c.call_id !== callId));
      fetchCalls(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tasdiqlashda xatolik yuz berdi");
    } finally {
      setAckingId(null);
    }
  };

  const handleResyncWatch = async () => {
    setWatchSyncing(true);
    try {
      await resyncWatch();
      const ok = await isWatchConnected();
      setWatchConnected(ok);
    } catch {
      setWatchConnected(false);
    } finally {
      setWatchSyncing(false);
    }
  };

  const renderItem = ({ item }: { item: Call }) => {
    const isHighlighted = item.call_id === focusCallId;
    const isAcking = ackingId === item.call_id;
    const step = getAgeStep(item.created_at);
    const stepFill = tokens.call.fill[mode][step - 1];

    return (
      <View
        style={[
          styles.callCard,
          { backgroundColor: stepFill },
          isHighlighted && styles.callCardHighlighted,
        ]}
      >
        <View style={styles.cardRail}>
          <View style={[styles.railSlot, styles.railSlotActive]} />
          <View style={[styles.railSlot, step >= 2 && styles.railSlotActive]} />
          <View style={[styles.railSlot, step >= 3 && styles.railSlotActive]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardMetaRow}>
            <Text style={styles.floorBadge}>{item.floor}-qavat</Text>
            <Text style={styles.timerLabel}>{elapsedSince(item.created_at)}</Text>
          </View>
          <Text style={styles.roomNumber}>{item.room_number}</Text>

          <TouchableOpacity
            style={[styles.ackSlab, isAcking && styles.ackSlabDisabled]}
            onPress={() => handleAck(item.call_id)}
            disabled={isAcking}
          >
            {isAcking ? (
              <ActivityIndicator color={stepFill} size="small" />
            ) : (
              <Text style={[styles.ackSlabText, { color: stepFill }]}>Tasdiqlash</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text1 }]}>Faol chaqiruvlar</Text>
          <Text style={[styles.headerSubtitle, { color: colors.text2 }]}>{calls.length} ta kutmoqda</Text>
        </View>
        <View style={styles.headerRight}>
          <ThemeToggle />
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.borderStrong }]}
            onPress={onLogout}
          >
            <Text style={[styles.logoutText, { color: colors.text2 }]}>Chiqish</Text>
          </TouchableOpacity>
        </View>
      </View>

      {billing?.warn && !billingDismissed ? (
        <BillingBanner notice={billing} onDismiss={() => setBillingDismissed(true)} />
      ) : null}

      <TouchableOpacity
        style={[
          styles.watchPill,
          {
            borderColor: watchConnected ? colors.accent : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
        onPress={handleResyncWatch}
        disabled={watchSyncing}
      >
        {watchSyncing ? (
          <ActivityIndicator color={colors.text2} size="small" />
        ) : (
          <Feather
            name="watch"
            size={14}
            color={watchConnected ? colors.accent : colors.text2}
          />
        )}
        <Text style={[styles.watchPillText, { color: watchConnected ? colors.accent : colors.text2 }]}>
          {watchConnected === null
            ? 'Soat tekshirilmoqda...'
            : watchConnected
              ? 'Soat: ulandi'
              : 'Soat: ulanmagan (qayta yuborish uchun bosing)'}
        </Text>
      </TouchableOpacity>

      {error ? (
        <View style={[styles.errorBanner, { borderColor: colors.attn, backgroundColor: colors.attnSoft }]}>
          <Text style={[styles.errorBannerText, { color: colors.attn }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : calls.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="check-circle" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.emptyText, { color: colors.text2 }]}>Hozircha faol chaqiruvlar yo'q</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => String(item.call_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCalls(true)}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.gutter.phone,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  logoutButton: {
    paddingHorizontal: tokens.space[12],
    paddingVertical: tokens.space[8],
    borderRadius: tokens.radius[2],
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
  },
  watchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: tokens.space[8],
    marginHorizontal: tokens.gutter.phone,
    marginBottom: tokens.space[12],
    paddingHorizontal: tokens.space[12],
    paddingVertical: tokens.space[8],
    borderRadius: tokens.radius.full,
    borderWidth: 1,
  },
  watchPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: tokens.gutter.phone,
    paddingBottom: tokens.space[24],
    gap: tokens.space[16],
  },
  callCard: {
    borderRadius: tokens.radius[3],
    padding: tokens.space[16],
    flexDirection: 'row',
    gap: tokens.space[12],
  },
  callCardHighlighted: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  cardRail: {
    width: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  railSlot: {
    width: 6,
    height: 18,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  railSlotActive: {
    backgroundColor: '#FFFFFF',
  },
  cardBody: {
    flex: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floorBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  roomNumber: {
    fontSize: 72,
    fontWeight: '700',
    color: '#FFFFFF',
    marginVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  ackSlab: {
    backgroundColor: '#FFFFFF',
    borderRadius: tokens.radius[2],
    minHeight: tokens.control[64],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.space[8],
  },
  ackSlabDisabled: {
    opacity: 0.7,
  },
  ackSlabText: {
    fontSize: 18,
    fontWeight: '700',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius[3],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  errorBanner: {
    marginHorizontal: tokens.gutter.phone,
    marginBottom: tokens.space[12],
    borderRadius: tokens.radius[2],
    padding: tokens.space[12],
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 13,
  },
});
