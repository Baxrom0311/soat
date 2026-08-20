import { NativeModules, Platform } from 'react-native';
import { getToken } from './auth';

// Hamshira telefonda login qilganda token juftlashtirilgan soatga
// Wearable Data Layer orqali yuboriladi — soatda parol qo'lda kiritilmaydi.
// Soat ulanmagan/yaqin bo'lmasa jim muvaffaqiyatsiz bo'ladi, login oqimini
// bloklamaydi.
export async function syncTokenToWatch(token: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await NativeModules.WearSync?.sendToken(token);
  } catch {
    // Play Services yo'q yoki soat ulanmagan bo'lishi mumkin.
  }
}

// Bluetooth orqali hozir juftlashtirilgan (ulangan) Wear OS qurilma bormi —
// UI'da holat ko'rsatish uchun. Token yetib borganini emas, faqat qurilma
// yaqin/ulanganini bildiradi.
export async function isWatchConnected(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return (await NativeModules.WearSync?.isWatchConnected()) ?? false;
  } catch {
    return false;
  }
}

// "Qayta yuborish" tugmasi uchun: saqlangan tokenni qayta soatga jo'natadi.
export async function resyncWatch(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  await syncTokenToWatch(token);
  return true;
}
