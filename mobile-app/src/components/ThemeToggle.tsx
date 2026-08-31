import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { tokens } from '../theme';

export default function ThemeToggle() {
  const { mode, colors, toggle } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
      onPress={toggle}
      accessibilityLabel="Kun/tun rejimini almashtirish"
    >
      <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={18} color={colors.text1} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: tokens.control[44],
    height: tokens.control[44],
    borderRadius: tokens.radius[2],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
