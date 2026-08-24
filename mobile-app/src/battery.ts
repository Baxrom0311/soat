import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const ASKED_KEY = 'nc_battery_opt_asked';
const AUTOSTART_ASKED_KEY = 'nc_autostart_asked';

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

// Xiaomi/Vivo/Oppo/Huawei/Infinix (Transsion) kabi OEM'lar push-bildirishnomani
// standart Android Doze'dan TASHQARI o'zlarining alohida "Autostart"/"Fon ishga
// tushirish ruxsati" ro'yxati orqali ham bloklaydi — yuqoridagi
// REQUEST_IGNORE_BATTERY_OPTIMIZATIONS bu OEM-maxsus cheklovni QAMRAB OLMAYDI.
// Shu sabab bu ilova "Infinix/Vivo/ba'zi Samsung modellarida ishlamayapti" deb
// xabar berilgan — eng ehtimoliy sabab: OEM foydalanuvchi qo'lda ruxsat
// bermaguncha ilovani fonda o'ldirib qo'yadi, push hech qachon yetib bormaydi.
//
// Har OEM'ning aynan qaysi Activity komponenti bu ekranni ochishi firmware
// versiyasiga qarab farq qiladi va hech qanday rasmiy Android API orqali
// so'ralmaydi — quyidagi ro'yxat turli firmware versiyalarida uchraydigan
// ma'lum komponent nomlaridan iborat. Har biri navbat bilan sinaladi;
// mos kelmagani ActivityNotFoundException bilan rad etiladi va indamay
// keyingisiga o'tiladi.
const AUTOSTART_INTENTS: Record<string, { packageName: string; className: string }[]> = {
  xiaomi: [
    { packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity' },
  ],
  redmi: [
    { packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity' },
  ],
  poco: [
    { packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity' },
  ],
  vivo: [
    { packageName: 'com.vivo.permissionmanager', className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity' },
    { packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity' },
    { packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.safeguard.PurviewTabActivity' },
  ],
  oppo: [
    { packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity' },
    { packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.startupapp.StartupAppListActivity' },
    { packageName: 'com.oppo.safe', className: 'com.oppo.safe.permission.startup.StartupAppListActivity' },
  ],
  realme: [
    { packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity' },
  ],
  huawei: [
    { packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity' },
    { packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.optimize.process.ProtectActivity' },
  ],
  honor: [
    { packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity' },
  ],
  // Infinix/Tecno/itel — barchasi Transsion'ga tegishli va bir xil
  // "Phone Manager" ilovasini ulashadi.
  infinix: [
    { packageName: 'com.transsion.phonemanager', className: 'com.transsion.phonemanager.ui.activity.PowerSecureActivity' },
    { packageName: 'com.transsion.phonemanager', className: 'com.itel.autobootmanager.ui.AppAutoBootActivity' },
  ],
  tecno: [
    { packageName: 'com.transsion.phonemanager', className: 'com.transsion.phonemanager.ui.activity.PowerSecureActivity' },
  ],
  itel: [
    { packageName: 'com.transsion.phonemanager', className: 'com.transsion.phonemanager.ui.activity.PowerSecureActivity' },
  ],
};

// Yuqoridagi OEM-maxsus ekranlardan birortasi topilmasa (masalan Samsung —
// alohida "Autostart" ekrani yo'q, yoki noma'lum firmware versiyasi), ilova
// ma'lumotlari ekraniga tushiriladi — foydalanuvchi qo'lda "Battery" ->
// "Allow background activity"/"Unrestricted" ni yoqishi mumkin.
async function openAppSettingsFallback(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', {
      data: `package:${Application.applicationId}`,
    });
  } catch {
    // jim o'tkazib yuboriladi
  }
}

export async function requestAutoStartPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const already = await SecureStore.getItemAsync(AUTOSTART_ASKED_KEY);
  if (already === 'true') return;
  await SecureStore.setItemAsync(AUTOSTART_ASKED_KEY, 'true');

  const manufacturer = (Device.manufacturer ?? '').toLowerCase();
  const oemKey = Object.keys(AUTOSTART_INTENTS).find((key) => manufacturer.includes(key));
  const candidates = oemKey ? AUTOSTART_INTENTS[oemKey] : [];

  for (const candidate of candidates) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', candidate);
      return; // birinchi muvaffaqiyatli ochilgani yetarli
    } catch {
      // Bu qurilma firmware'sida bu ekran yo'q — keyingi nomzodni sinaymiz.
    }
  }

  await openAppSettingsFallback();
}
