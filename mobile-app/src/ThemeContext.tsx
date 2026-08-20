import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkColors, lightColors, ThemeColors } from './theme';

type Mode = 'light' | 'dark';

interface ThemeContextValue {
  mode: Mode;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'nc_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<Mode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    // Foydalanuvchi oldin qo'lda tanlagan mavzu bo'lsa, tizim sozlamasidan ustun turadi.
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
    });
  }, []);

  const toggle = () => {
    setMode((prev) => {
      const next: Mode = prev === 'dark' ? 'light' : 'dark';
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  const value: ThemeContextValue = {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    toggle,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() faqat ThemeProvider ichida ishlatiladi');
  return ctx;
}
