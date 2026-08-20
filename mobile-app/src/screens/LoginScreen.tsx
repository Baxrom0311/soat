import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';

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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <ThemeToggle />
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
          <Feather name="activity" size={20} color={colors.textOnAccent} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>NurseCall</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Hamshiralar uchun chaqiruv paneli</Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.textPrimary }]}
          value={email}
          onChangeText={setEmail}
          placeholder="hamshira@klinika.uz"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!loading}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>Parol</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.textPrimary }]}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          editable={!loading}
        />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.accent }, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>Kirish</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  topBar: {
    position: 'absolute',
    top: 20,
    right: 24,
    zIndex: 1,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
    alignSelf: 'flex-start',
  },
  button: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
