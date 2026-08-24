import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import CallsScreen from './src/screens/CallsScreen';
import UpdateRequiredScreen from './src/screens/UpdateRequiredScreen';
import {
  getToken,
  getEmail,
  saveSession,
  clearSession,
  savePushToken,
  getPushToken,
  clearPushToken,
} from './src/auth';
import {
  getVersionInfo,
  login,
  refreshToken,
  registerPushToken,
  setUnauthorizedHandler,
  unregisterPushToken,
} from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { requestIgnoreBatteryOptimizations } from './src/battery';
import { syncTokenToWatch } from './src/wearSync';
import { ThemeProvider, useTheme } from './src/ThemeContext';

// Push ro'yxatdan o'tkazish muvaffaqiyatsiz bo'lsa shu intervalda qayta uriniladi
// (ilova ochilganda internet bo'lmasligi yoki server vaqtincha yotishi mumkin).
const PUSH_RETRY_MS = 60000;

// Token JWT_EXPIRE_MINUTES (24 soat) da eskiradi — bu intervalda (ancha zaxira
// bilan) qayta yangilanadi, aks holda hamshira soati ham, telefoni ham bir kunda
// sessiyadan chiqib qoladi. Har yangilanishda yangi token soatga ham uzatiladi.
const TOKEN_REFRESH_MS = 6 * 60 * 60 * 1000;

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { colors, mode } = useTheme();
  const [checkingSession, setCheckingSession] = useState(true);
  const [outdated, setOutdated] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [focusCallId, setFocusCallId] = useState<number | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const registeringRef = useRef(false);

  const registerPush = useCallback(async () => {
    if (pushTokenRef.current) return; // allaqachon muvaffaqiyatli ro'yxatdan o'tgan
    if (registeringRef.current) return; // allaqachon davom etayotgan urinish bor
    registeringRef.current = true;
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await registerPushToken(token);
        pushTokenRef.current = token;
        await savePushToken(token);
        await requestIgnoreBatteryOptimizations();
      }
    } catch (err) {
      // Push ro'yxatdan o'tkazish muvaffaqiyatsiz bo'lsa ham ilova ishlashda davom etadi
      // (foydalanuvchi hali ham ilovani ochib chaqiruvlarni ko'ra oladi) — retry-interval
      // va foreground hodisasi keyinroq qayta urinadi.
      console.warn('Push ro\'yxatdan o\'tkazish muvaffaqiyatsiz:', err);
    } finally {
      registeringRef.current = false;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { access_token } = await refreshToken();
      const currentEmail = (await getEmail()) ?? '';
      await saveSession(access_token, currentEmail);
      await syncTokenToWatch(access_token);
    } catch {
      // 401 bo'lsa onUnauthorized allaqachon login ekraniga qaytaradi; tarmoq
      // xatosi bo'lsa keyingi urinishda (interval yoki foreground) qayta sinaladi.
    }
  }, []);

  // Ilova ishga tushganda bir marta: agar bu build serverning minimal talabidan
  // eski bo'lsa, hech narsa (login ham) ishlamay, faqat yangilash xabari chiqadi —
  // eski buildlar API'ni buzadigan o'zgarish bilan jim yiqilib qolmasligi uchun.
  useEffect(() => {
    (async () => {
      try {
        const { min_mobile_version } = await getVersionInfo();
        const current = Number(Application.nativeBuildVersion ?? 0);
        if (current > 0 && current < min_mobile_version) setOutdated(true);
      } catch {
        // Server bilan bog'lanib bo'lmasa (masalan birinchi ochilishda offline)
        // ilovani bloklamaymiz — keyingi so'rovlar baribir shu tekshiruvdan o'tadi.
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        setEmail((await getEmail()) ?? '');
        registerPush();
        syncTokenToWatch(token);
        refreshSession();
      }
      setCheckingSession(false);
    })();
  }, [registerPush, refreshSession]);

  // 401 (sessiya muddati tugadi) — login ekraniga qaytish. Serverdagi push
  // ro'yxatini o'chirishga urinmaymiz: token baribir yaroqsiz.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setEmail(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Push registratsiyasi birinchi urinishda o'tmagan bo'lsa: har PUSH_RETRY_MS'da
  // va ilova foreground'ga qaytganda qayta uriniladi.
  useEffect(() => {
    if (email === null) return;

    const retryTimer = setInterval(() => registerPush(), PUSH_RETRY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') registerPush();
    });
    return () => {
      clearInterval(retryTimer);
      subscription.remove();
    };
  }, [email, registerPush]);

  // Token muddati tugashiga qarab davriy yangilanadi va soatga uzatiladi —
  // shu tufayli hamshira kuni-kuniga qayta login qilmasligi kerak.
  useEffect(() => {
    if (email === null) return;

    const refreshTimer = setInterval(() => refreshSession(), TOKEN_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSession();
    });
    return () => {
      clearInterval(refreshTimer);
      subscription.remove();
    };
  }, [email, refreshSession]);

  // Bildirishnoma bosilganda (fon/yopiq holatda) Calls ekraniga o'tib, tegishli chaqiruvni belgilash.
  useEffect(() => {
    const applyResponse = (response: Notifications.NotificationResponse | null) => {
      const callId = response?.notification.request.content.data?.call_id;
      if (typeof callId === 'number') setFocusCallId(callId);
    };

    applyResponse(Notifications.getLastNotificationResponse());

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      applyResponse(response);
    });

    return () => subscription.remove();
  }, []);

  const handleLogin = async (loginEmail: string, password: string) => {
    const { access_token } = await login(loginEmail, password);
    await saveSession(access_token, loginEmail);
    setEmail(loginEmail);
    await registerPush();
    await syncTokenToWatch(access_token);
  };

  const handleLogout = async () => {
    try {
      // In-memory ref bo'sh bo'lishi mumkin (masalan, ilova qayta ochilgan) —
      // diskda saqlangan tokenga qaytamiz, aks holda chiqib ketgan qurilmaga
      // bemor chaqiruvlari kelaverar edi.
      const pushToken = pushTokenRef.current ?? (await getPushToken());
      if (pushToken) {
        await unregisterPushToken(pushToken);
      }
    } catch {
      // Serverga yetib bo'lmasa ham lokal chiqishni bloklamaymiz.
    }
    pushTokenRef.current = null;
    await clearPushToken();
    await clearSession();
    await syncTokenToWatch('');
    setEmail(null);
  };

  const statusBarStyle = mode === 'dark' ? 'light' : 'dark';

  if (checkingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <StatusBar style={statusBarStyle} />
      </View>
    );
  }

  if (outdated) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <UpdateRequiredScreen />
        <StatusBar style={statusBarStyle} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {email === null ? (
        showWelcome ? (
          <WelcomeScreen onContinue={() => setShowWelcome(false)} />
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )
      ) : (
        <CallsScreen
          acknowledgedBy={email}
          onLogout={handleLogout}
          focusCallId={focusCallId}
          onFocusHandled={() => setFocusCallId(null)}
        />
      )}
      <StatusBar style={statusBarStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
