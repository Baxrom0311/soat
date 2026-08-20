import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// Ilova ochiq bo'lganda ham bildirishnoma banner sifatida ko'rinishi uchun.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Emulyator/simulyatorda push token olib bo'lmaydi (Expo cheklovi).
    return null;
  }

  if (Platform.OS === 'android') {
    // sound kaliti ataylab yo'q: bu SDK'da string qiymat maxsus raw-resurs fayl
    // nomi deb qabul qilinadi ('default' degan fayl yo'q — har ishga tushishda
    // ERROR log yozardi). Kalit berilmasa tizimning standart ovozi ishlatiladi.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bemor chaqiruvlari',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C5CE7',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  return tokenResponse.data;
}
