import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BillingNotice } from '../api';
import { useTheme } from '../ThemeContext';

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

// Ikkala holatda ham eng muhim gap bir xil: chaqiruvlar ishlashda davom etadi.
// Hamshira "ilova o'chdi" deb o'ylab qolmasligi kerak.
function detailFor(notice: BillingNotice): string {
  return notice.blocked
    ? "Xona/qurilma/xodim qo'shish va hisobotlar vaqtincha yopildi. Chaqiruvlarni qabul qilish va tasdiqlash ishlayapti — rahbariyatga xabar bering."
    : "Chaqiruvlar ishlashda davom etadi. To'lov uchun rahbariyatga xabar bering.";
}

export default function BillingBanner({ notice, onDismiss }: Props) {
  const { colors } = useTheme();
  const tone = notice.blocked ? colors.danger : colors.warning;

  return (
    <View style={[styles.banner, { borderColor: tone, backgroundColor: colors.surfaceAlt }]}>
      <Feather name="alert-circle" size={16} color={tone} style={styles.icon} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: tone }]}>{titleFor(notice)}</Text>
        <Text style={[styles.detail, { color: colors.textMuted }]}>{detailFor(notice)}</Text>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.close}
        accessibilityLabel="Eslatmani yopish"
      >
        <Feather name="x" size={16} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  icon: {
    marginTop: 1,
    marginRight: 8,
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
    marginTop: 2,
    lineHeight: 16,
  },
  close: {
    marginLeft: 8,
    padding: 2,
  },
});
