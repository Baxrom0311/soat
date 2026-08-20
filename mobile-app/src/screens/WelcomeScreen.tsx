import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';

interface Props {
  onContinue: () => void;
}

const FEATURES = [
  { icon: 'zap' as const, text: 'Chaqiruv yuborilgach bir necha soniyada bildiradi' },
  { icon: 'shield' as const, text: 'Har bir klinikaning maʻlumoti butunlay izolyatsiya qilingan' },
  { icon: 'bell' as const, text: 'Ekran oʻchiq boʻlsa ham push-bildirishnoma keladi' },
];

export default function WelcomeScreen({ onContinue }: Props) {
  const { colors } = useTheme();

  // Brend belgisi atrofidagi uzluksiz "puls" halqasi.
  const pulse = useRef(new Animated.Value(0)).current;
  // Kirish paytidagi ketma-ket paydo bo'lish animatsiyasi.
  const entrance = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const heroEntrance = useRef(new Animated.Value(0)).current;
  const buttonEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    Animated.sequence([
      Animated.timing(heroEntrance, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(
        90,
        entrance.map((v) => Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }))
      ),
      Animated.timing(buttonEntrance, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <ThemeToggle />
      </View>

      <Animated.View
        style={[
          styles.hero,
          {
            opacity: heroEntrance,
            transform: [{ translateY: heroEntrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}
      >
        <View style={styles.brandWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.brandRing,
              { borderColor: colors.accent, opacity: ringOpacity, transform: [{ scale: ringScale }] },
            ]}
          />
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
            <Feather name="activity" size={26} color={colors.textOnAccent} />
          </View>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>NurseCall</Text>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          Bemor bir marta bosadi.{'\n'}Hamshira soniyalarda biladi.
        </Text>
        <Text style={[styles.subhead, { color: colors.textMuted }]}>
          Hamshiralar uchun bemor chaqiruv paneli — xonadagi SOS tugmadan bilagingizgacha.
        </Text>
      </Animated.View>

      <View style={styles.features}>
        {FEATURES.map((f, i) => (
          <Animated.View
            key={f.text}
            style={[
              styles.featureRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              {
                opacity: entrance[i],
                transform: [{ translateY: entrance[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
            ]}
          >
            <View style={[styles.featureIconWrap, { backgroundColor: colors.background }]}>
              <Feather name={f.icon} size={17} color={colors.accent} />
            </View>
            <Text style={[styles.featureText, { color: colors.textPrimary }]}>{f.text}</Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View style={{ opacity: buttonEntrance }}>
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={onContinue}>
          <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>Boshlash</Text>
          <Feather name="arrow-right" size={18} color={colors.textOnAccent} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 28,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  hero: {
    alignItems: 'center',
    marginTop: 8,
  },
  brandWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 18,
  },
  headline: {
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 33,
    marginBottom: 12,
  },
  subhead: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  features: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
  },
  button: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
