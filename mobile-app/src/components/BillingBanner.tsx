import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BillingNotice } from '../api';
import { useTheme } from '../ThemeContext';
import { tokens } from '../theme';

interface Props {
  notice: BillingNotice;
  onDismiss: () => void;
}

function titleFor(notice: BillingNotice): string {
  if (notice.blocked) return "Obuna tugadi — boshqaruv to'xtatildi";

  const days = notice.days_left;
  if (days === null) return 'Obuna muddati tugayapti';
  if (days < 0) return `Obuna to'lovi ${Math.abs(days)} kun kechikdi`;
  if (days === 0) return 'Obuna bugun tugaydi';
  if (days === 1) return 'Obuna ertaga tugaydi';
  return `Obuna ${days} kundan keyin tugaydi`;
}

function detailFor(notice: BillingNotice): string {
  return notice.blocked
    ? "Xona/qurilma/xodim qo'shish va hisobotlar vaqtincha yopildi. Chaqiruvlarni qabul qilish va tasdiqlash ishlayapti — rahbariyatga xabar bering."
    : "Chaqiruvlar ishlashda davom etadi. To'lov uchun rahbariyatga xabar bering.";
}

export default function BillingBanner({ notice, onDismiss }: Props) {
  const { colors } = useTheme();
  const tone = colors.attn;

  return (
    <View style={[styles.banner, { borderColor: tone, backgroundColor: colors.attnSoft }]}>
      <Feather name="alert-circle" size={16} color={tone} style={styles.icon} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: tone }]}>{titleFor(notice)}</Text>
        <Text style={[styles.detail, { color: colors.text2 }]}>{detailFor(notice)}</Text>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.close}
        accessibilityLabel="Eslatmani yopish"
      >
        <Feather name="x" size={16} color={colors.text3} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: tokens.gutter.phone,
    marginBottom: tokens.space[12],
    borderRadius: tokens.radius[2],
    borderWidth: 1,
    paddingVertical: tokens.space[12],
    paddingHorizontal: tokens.space[12],
  },
  icon: {
    marginTop: 1,
    marginRight: tokens.space[8],
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  detail: {
    fontSize: 12,
    marginTop: tokens.space[4],
    lineHeight: 16,
  },
  close: {
    marginLeft: tokens.space[8],
    padding: tokens.space[4],
  },
});
