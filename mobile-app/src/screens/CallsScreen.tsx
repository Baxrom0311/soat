import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ackCall, ApiError, Call, getActiveCalls } from '../api';
import { POLL_INTERVAL_MS } from '../config';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { elapsedSince } from '../time';
import { isWatchConnected, resyncWatch } from '../wearSync';

const WATCH_CHECK_MS = 30000;

interface Props {
  acknowledgedBy: string;
  onLogout: () => void;
  focusCallId: number | null;
  onFocusHandled: () => void;
}

export default function CallsScreen({ acknowledgedBy, onLogout, focusCallId, onFocusHandled }: Props) {
  const { colors } = useTheme();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [watchConnected, setWatchConnected] = useState<boolean | null>(null);
  const [watchSyncing, setWatchSyncing] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // So'rovlar tartib raqami: sekin qolib ketgan eski poll javobi yangi
  // ma'lumot (yoki lokal ack) ustiga yozilmasligi uchun faqat eng oxirgi
  // boshlangan so'rov natijasi qabul qilinadi.
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

    // "necha vaqtdan beri" matnini yangilab turish uchun (tarmoq so'rovisiz).
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
    let cancelled = false;
    const checkWatch = () => {
      isWatchConnected().then((connected) => {
        if (!cancelled) setWatchConnected(connected);
      });
    };

    checkWatch();
    const watchTimer = setInterval(checkWatch, WATCH_CHECK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkWatch();
    });
    return () => {
      cancelled = true;
      clearInterval(watchTimer);
      subscription.remove();
    };
  }, []);

  const handleResyncWatch = async () => {
    setWatchSyncing(true);
    try {
      await resyncWatch();
    } finally {
      setWatchConnected(await isWatchConnected());
      setWatchSyncing(false);
    }
  };

  useEffect(() => {
    if (focusCallId) {
      // onFocusHandled darhol chaqirilsa, ro'yxat hali yuklanmasidan focusCallId
      // null bo'lib, kartochka hech qachon belgilanmay qolar edi — avval fetch
      // tugashini kutamiz, belgi bir necha soniya ko'rinib turadi.
      fetchCalls(false).then(() => {
        setTimeout(onFocusHandled, 5000);
      });
    }
  }, [focusCallId, fetchCalls, onFocusHandled]);

  const handleAck = async (callId: number) => {
    setAckingId(callId);
    try {
      await ackCall(callId, acknowledgedBy);
      // Hozir havoda bo'lgan eski poll javobi yopilgan chaqiruvni qayta
      // "tiriltirmasligi" uchun uni bekor qilamiz.
      fetchSeqRef.current++;
      setCalls((prev) => prev.filter((c) => c.call_id !== callId));
    } catch (e) {
      // Server "allaqachon tasdiqlangan"ni 409 bilan, "topilmadi"ni 404 bilan
      // qaytaradi — ikkalasida ham chaqiruv boshqa hamshira tomonidan yopilgan,
      // kartochkani ro'yxatdan olib tashlaymiz.
      const alreadyAcked = e instanceof ApiError && (e.status === 409 || e.status === 404);
      const message = alreadyAcked
        ? 'Bu chaqiruv allaqachon tasdiqlangan'
        : e instanceof Error
          ? e.message
          : "Tasdiqlab bo'lmadi";
      setError(message);
      if (alreadyAcked) {
        setCalls((prev) => prev.filter((c) => c.call_id !== callId));
      }
    } finally {
      setAckingId(null);
    }
  };

  const renderItem = ({ item }: { item: Call }) => {
    const isHighlighted = item.call_id === focusCallId;
    const isAcking = ackingId === item.call_id;
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          isHighlighted && { borderColor: colors.accent, borderWidth: 2 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
          <Feather name="bell" size={18} color={colors.danger} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.room, { color: colors.textPrimary }]}>Xona {item.room_number}</Text>
          <Text style={[styles.floor, { color: colors.textMuted }]}>{item.floor}-qavat</Text>
          <Text style={[styles.waiting, { color: colors.accentAlt }]}>{elapsedSince(item.created_at)} kutmoqda</Text>
        </View>
        <TouchableOpacity
          style={[styles.ackButton, { backgroundColor: colors.accent }, isAcking && styles.ackButtonDisabled]}
          onPress={() => handleAck(item.call_id)}
          disabled={isAcking}
        >
          {isAcking ? (
            <ActivityIndicator color={colors.textOnAccent} size="small" />
          ) : (
            <Text style={[styles.ackButtonText, { color: colors.textOnAccent }]}>Tasdiqlash</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Faol chaqiruvlar</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{calls.length} ta kutmoqda</Text>
        </View>
        <View style={styles.headerRight}>
          <ThemeToggle />
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.border }]}
            onPress={onLogout}
          >
            <Text style={[styles.logoutText, { color: colors.textMuted }]}>Chiqish</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.watchPill,
          {
            borderColor: watchConnected ? colors.accentAlt : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
        onPress={handleResyncWatch}
        disabled={watchSyncing}
      >
        {watchSyncing ? (
          <ActivityIndicator color={colors.textMuted} size="small" />
        ) : (
          <Feather
            name="watch"
            size={14}
            color={watchConnected ? colors.accentAlt : colors.textMuted}
          />
        )}
        <Text style={[styles.watchPillText, { color: watchConnected ? colors.accentAlt : colors.textMuted }]}>
          {watchConnected === null
            ? 'Soat tekshirilmoqda...'
            : watchConnected
              ? 'Soat: ulandi'
              : 'Soat: ulanmagan (qayta yuborish uchun bosing)'}
        </Text>
      </TouchableOpacity>

      {error ? (
        <View style={[styles.errorBanner, { borderColor: colors.danger, backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.errorBannerText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : calls.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="check-circle" size={26} color={colors.accentAlt} />
          </View>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Hozircha faol chaqiruvlar yo'q</Text>
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
    </View>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
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
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  watchPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  room: {
    fontSize: 18,
    fontWeight: '700',
  },
  floor: {
    fontSize: 13,
    marginTop: 2,
  },
  waiting: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
  ackButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  ackButtonDisabled: {
    opacity: 0.6,
  },
  ackButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
    borderRadius: 16,
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
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 13,
  },
});
