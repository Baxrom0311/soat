import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';

const ASKED_KEY = 'nc_battery_opt_asked';

// Doze/batareya optimizatsiyasi push-bildirishnomani va fon poll'ini kechiktirishi
// (ba'zan butunlay bloklashi) mumkin — bu Android'dagi eng keng tarqalgan "push
// kelmadi" sababi. Foydalanuvchidan bir marta (login'dan keyin) chiqarib qo'yish
// so'raladi; bu tizim dialogi, majburlab bo'lmaydi, lekin ko'pchilik shu yerda
// "Allow"ni bosadi.
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const already = await SecureStore.getItemAsync(ASKED_KEY);
  if (already === 'true') return;

  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${Application.applicationId}` }
    );
  } catch {
    // Ba'zi qurilmalar/OEM'larda bu intent yo'q bo'lishi mumkin — jim o'tkazib yuboramiz.
  } finally {
    await SecureStore.setItemAsync(ASKED_KEY, 'true');
  }
}
