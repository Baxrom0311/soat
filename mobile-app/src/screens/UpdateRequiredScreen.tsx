import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';

export default function UpdateRequiredScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="download" size={28} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Yangilanish talab qilinadi</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Bu ilovaning eski versiyasi endi qo'llab-quvvatlanmaydi. Davom etish uchun IT
        xodimingizdan yangi versiyani so'rang.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
