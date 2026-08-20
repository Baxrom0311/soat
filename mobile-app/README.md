# NurseCall — mobil ilova (Expo / React Native / TypeScript)

Hamshiralar uchun bemor chaqiruvlarini push-bildirishnoma orqali darhol ko'rsatadigan va
"tasdiqlash" (ack) qilish imkonini beruvchi mobil ilova. Bitta kod bazasi — Android va iOS.

## Loyiha tuzilishi

```
mobile-app/
  App.tsx                    # Ekranlar orasida oddiy state-based almashtirish, push-listener'lar
  src/
    config.ts                # Backend server manzili (SHU YERDA o'zgartiriladi)
    api.ts                   # Backend bilan HTTP so'rovlar (login, calls, ack, push-tokens)
    auth.ts                  # Token/emailni SecureStore'da saqlash
    notifications.ts         # Push ruxsat so'rash + Expo push token olish
    theme.ts                 # Ranglar palitrasi
    time.ts                  # "necha vaqtdan beri kutmoqda" formatlash
    screens/
      LoginScreen.tsx
      CallsScreen.tsx
```

## 1. Server manzilini sozlash

`src/config.ts` faylini oching:

```ts
export const API_BASE_URL = 'https://nurcecall.boos.uz';
```

Lokal backend bilan sinash uchun shu qatorni kompyuteringiz LAN IP manziliga almashtiring
(masalan `http://192.168.1.5:8010`). Jismoniy telefonda ishlatilganda `127.0.0.1` yoki
`localhost` telefonning o'zini anglatadi, kompyuterni emas — shuning uchun kompyuterning
tarmoqdagi haqiqiy IP manzilidan foydalaning (`ifconfig` / `ipconfig getifaddr en0`).

## 2. O'rnatish va ishga tushirish

```bash
cd mobile-app
npm install
npx expo start
```

Terminalda QR kod chiqadi.

### Expo Go orqali sinash (tezkor, lekin push-bildirishnoma android'da ishlamaydi)

> **Muhim**: SDK 53'dan boshlab Expo Go **Android**'da masofaviy (remote) push-bildirishnomalarni
> qo'llab-quvvatlamaydi — faqat "development build" orqali ishlaydi (quyida). Lokal
> bildirishnomalar va ilovaning qolgan qismi (login, chaqiruvlar ro'yxati, ack) Expo Go'da
> to'liq ishlaydi, faqat serverdan real push kelishini sinash uchun development build kerak.

1. Telefoningizga **Expo Go** ilovasini o'rnating:
   - Android: Google Play Store'dan "Expo Go" qidiring.
   - iOS: App Store'dan "Expo Go" qidiring.
2. Kompyuter va telefon **bir xil Wi-Fi tarmog'ida** bo'lishi kerak.
3. `npx expo start` ishga tushgach chiqqan QR kodni:
   - Android: Expo Go ilovasi ichidan "Scan QR code" bilan skanerlang.
   - iOS: telefon kamerasi bilan skanerlang, chiqqan bildirishnomani bosing.

### Development build orqali sinash (push-bildirishnoma UCHUN TAVSIYA ETILADI)

Bu haqiqiy native ilova quradi va uni qurilmaga o'rnatadi — Expo Go kerak emas, barcha
funksiyalar (jumladan Android'da push) to'liq ishlaydi.

```bash
# Android (USB orqali ulangan qurilmaga yoki emulyatorga o'rnatadi)
npx expo run:android

# iOS (faqat macOS'da, Xcode talab qiladi)
npx expo run:ios
```

Birinchi marta ishga tushirilganda Android/iOS native loyihalarini generatsiya qiladi
(`android/`, `ios/` papkalari — bular `.gitignore`'da, qayta generatsiya qilinaveradi) va
Gradle/Xcode orqali quradi. Bu bir necha daqiqa vaqt olishi mumkin.

## 3. TypeScript tekshiruvi

```bash
npx tsc --noEmit
```

## 4. Push-bildirishnoma qanday ishlaydi

1. Ilova login bo'lgandan keyin `expo-notifications` orqali ruxsat so'raydi.
2. Ruxsat berilsa, Expo push token olinadi (`Notifications.getExpoPushTokenAsync`).
3. Token backend'ga yuboriladi: `POST /api/v1/push-tokens { expo_push_token }`.
4. Yangi bemor chaqiruvi bo'lganda backend Expo Push API orqali shu tokenlarga
   bildirishnoma yuboradi — ilova fonda yoki hatto yopiq bo'lsa ham, telefon
   sarlavha+matnni ko'rsatadi.
5. Bildirishnoma bosilsa, ilova ochilib to'g'ridan-to'g'ri Calls ekraniga olib boradi va
   tegishli chaqiruvni ajratib ko'rsatadi.
6. Chiqish (logout) tugmasi bosilganda token backend'dan o'chiriladi:
   `DELETE /api/v1/push-tokens`.

## 5. Ekranlar

- **Login** — email + parol, xato xabarlari, muvaffaqiyatli kirishda token
  `expo-secure-store`'ga saqlanadi.
- **Calls** — `GET /api/v1/calls/active` har 10 soniyada so'raladi (ilova ochiq/faol
  bo'lganda). Har bir chaqiruv uchun: xona raqami, qavat, necha vaqtdan beri kutayotgani,
  "Tasdiqlash" tugmasi (ack qiladi, ro'yxatdan olib tashlaydi). Yuqorida "Chiqish" tugmasi.

## Muammolarni bartaraf etish

- **"Network request failed"** — `src/config.ts`'dagi `API_BASE_URL`ni tekshiring, telefon
  va server bir xil tarmoqda ekanini tasdiqlang.
- **Push token olinmayapti** — jismoniy qurilmada bo'lishi kerak (emulyator/simulyatorda
  push token berilmaydi), ruxsat berilganini tekshiring, Android'da Expo Go emas
  development build ishlatilganini tasdiqlang.
