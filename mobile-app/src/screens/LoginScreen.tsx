import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { tokens } from '../theme';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: Props) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Email va parolni kiriting');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kirishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <ThemeToggle />
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
            <Feather name="activity" size={20} color={colors.accentInk} />
          </View>
          <Text style={[styles.title, { color: colors.text1 }]}>NurseCall</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>Hamshiralar uchun chaqiruv paneli</Text>

          <Text style={[styles.label, { color: colors.text2 }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surfaceSoft, borderColor: colors.borderField, color: colors.text1 },
            ]}
            value={email}
            onChangeText={setEmail}
            placeholder="hamshira@klinika.uz"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />

          <Text style={[styles.label, { color: colors.text2 }]}>Parol</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surfaceSoft, borderColor: colors.borderField, color: colors.text1 },
            ]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.text3}
            secureTextEntry
            editable={!loading}
          />

          {error ? <Text style={[styles.error, { color: colors.attn }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.accentInk }]}>Kirish</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.gutter.phone,
  },
  topBar: {
    position: 'absolute',
    top: 20,
    right: tokens.gutter.phone,
    zIndex: 1,
  },
  card: {
    borderRadius: tokens.radius[3],
    padding: tokens.space[24],
    borderWidth: 1,
    alignItems: 'center',
  },
  brandMark: {
    width: tokens.control[44],
    height: tokens.control[44],
    borderRadius: tokens.radius[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space[12],
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: tokens.space[4],
    marginBottom: tokens.space[24],
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 13,
    marginBottom: tokens.space[4],
    marginTop: tokens.space[12],
  },
  input: {
    alignSelf: 'stretch',
    borderRadius: tokens.radius[2],
    paddingHorizontal: tokens.space[16],
    paddingVertical: tokens.space[12],
    fontSize: 16,
    borderWidth: 1,
    fontVariant: ['tabular-nums'],
  },
  error: {
    marginTop: tokens.space[12],
    fontSize: 13,
    alignSelf: 'flex-start',
  },
  button: {
    alignSelf: 'stretch',
    borderRadius: tokens.radius[2],
    minHeight: tokens.control[48],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.space[24],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
