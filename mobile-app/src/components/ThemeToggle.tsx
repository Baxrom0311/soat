import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';

export default function ThemeToggle() {
  const { mode, colors, toggle } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      onPress={toggle}
      accessibilityLabel="Kun/tun rejimini almashtirish"
    >
      <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={18} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
