import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'access_token';
const EMAIL_KEY = 'user_email';
const PUSH_TOKEN_KEY = 'expo_push_token';

export async function saveSession(token: string, email: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(EMAIL_KEY, email);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(EMAIL_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
}

// Push token diskda ham saqlanadi: ilova qayta ochilganda in-memory ref bo'sh
// bo'ladi, lekin chiqishda serverdagi ro'yxatdan o'chirish uchun token kerak —
// aks holda chiqib ketgan qurilmaga bemor chaqiruvlari kelaverar edi.
export async function savePushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function getPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

export async function clearPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
