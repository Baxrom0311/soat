# Nurse-call ESP32 firmware

Har qavatda o'rnatilgan ESP32 qurilmasi 433MHz RF receiver (masalan SRX882
yoki oddiy superheterodyne modul) orqali bemor xonasidagi EV1527 protokolli
SOS tugma (24-bit kod + 4-bit tugma-ID chiqaradigan oddiy RF remote/tugma)
signalini qabul qiladi, dekodlaydi va WiFi orqali markaziy nurse-call
backend serverga (`POST /api/v1/calls`) chaqiruv yuboradi.

## Uskuna ulash sxemasi

```
433MHz RF receiver module          ESP32 DevKit
--------------------------         ------------
VCC (5V yoki 3.3V, modulga qarab)  5V / 3V3
GND                                GND
DATA / OUT                          GPIO27  (RF_RECEIVER_PIN, config.h'da o'zgartirish mumkin)
```

- Ko'pchilik arzon 433MHz superheterodyne modullar 5V bilan ishlaydi, lekin
  DATA chiqishi ESP32'ning 3.3V logikasiga mos keladi — to'g'ridan-to'g'ri
  ulash mumkin (level-shifter shart emas), lekin modul datasheetini albatta
  tekshiring.
- Antenna sifatida ~17.3cm uzunlikdagi tik sim (433MHz uchun quarter-wave)
  qabul sifatini sezilarli oshiradi.
- `RF_RECEIVER_PIN` — interrupt qo'llab-quvvatlaydigan har qanday GPIO
  bo'lishi mumkin (ESP32'da deyarli barcha GPIO'lar interrupt qila oladi,
  GPIO34-39 kabi faqat-input pinlarini ham ishlatish mumkin, lekin ular
  pull-up qilinmagan — tashqi pull-up/down kerak bo'lishi mumkin).

## config.h sozlash

Loyihada haqiqiy parol/kalitlar bilan `src/config.h` git repoga tushmasligi
uchun `.gitignore`ga qo'shilgan. Birinchi marta sozlashda:

```bash
cp src/config.h.example src/config.h
```

Keyin `src/config.h` ichidagi qiymatlarni to'ldiring:

| Konstantа | Ma'nosi |
|---|---|
| `SETUP_AP_PASSWORD` | Birinchi yoqishda ochiladigan sozlash AP'sining (captive-portal) paroli, default `nursecall123` |
| `SERVER_HOST` / `SERVER_PORT` | Backend server host va port (production: `443`, HTTPS) |
| `SERVER_PATH` | API endpoint yo'li (`/api/v1/calls`, backend contract bilan mos) |
| `DEVICE_KEY` | **IXTIYORIY** (quyidagi "Zero-touch provisioning" bo'limiga qarang). Bo'sh (`""`) qoldirilsa, qurilma o'zi dashboard orqali biriktirilishini kutadi. To'ldirilsa — eski, qo'lda-sozlash oqimi: dashboard'da shu qurilma uchun generatsiya qilingan noyob kalit |
| `DEVICE_ID` | **IXTIYORIY** — qarang yuqoridagi izoh. To'ldirilsa, dashboard'da ro'yxatga olishda kiritilgan device_id bilan AYNAN bir xil bo'lishi kerak, masalan `floor2-esp32-01` |
| `RF_RECEIVER_PIN` | RF receiver DATA pini ulangan GPIO raqami |
| `DEDUPE_WINDOW_MS` | Bir xil EV1527 kodi shu vaqt (ms) ichida qayta kelsa, serverga qayta yuborilmaydi |
| `HEARTBEAT_PATH` / `HEARTBEAT_INTERVAL_MS` | Heartbeat endpoint yo'li va yuborish intervali (default 60 soniya) |
| `RETRY_INTERVAL_MS` | Offline navbatdagi chaqiruvni qayta yuborish urinishlari orasidagi interval (default 5 soniya) |
| `PENDING_MAX_AGE_MS` | Navbatdagi chaqiruv shu vaqtdan (default 2 daqiqa) eskirsa, ogohlantirish bilan tashlab yuboriladi |

DIQQAT: WiFi SSID/parol endi `config.h`da EMAS — ular captive-portal orqali
kiritiladi va ESP32'ning NVS xotirasida saqlanadi (quyidagi bo'limga qarang).

## Birinchi yoqish: WiFi'ni captive-portal orqali sozlash

Firmware'da WiFi paroli yo'q, shuning uchun bitta binary'ni istalgan
klinikaga flash qilish mumkin. Birinchi yoqilganda (yoki saqlangan tarmoqqa
ulanib bo'lmasa) qurilma o'zi WiFi access-point ochadi:

1. Qurilmani tokka ulang. U `NurseCall-<DEVICE_ID>` nomli AP ochadi
   (masalan `NurseCall-floor2-esp32-01`), parol — `SETUP_AP_PASSWORD`
   (default `nursecall123`).
2. Telefon yoki noutbukdan shu tarmoqqa ulaning — captive-portal sahifasi
   avtomatik ochiladi (ochilmasa brauzerda `192.168.4.1` ga kiring).
3. "Configure WiFi" tugmasini bosib, klinika WiFi tarmog'ini tanlang va
   parolini kiriting.
4. Qurilma sozlamalarni NVS xotirasiga saqlaydi, tarmoqqa ulanadi va normal
   ish rejimiga o'tadi. Keyingi yoqilishlarda portal ochilmaydi — saqlangan
   sozlamalar bilan avtomatik ulanadi.

Agar portal 180 soniya ichida sozlanmasa, qurilma qayta yuklanadi va
jarayon boshidan boshlanadi (NVS'da eski to'g'ri sozlamalar bo'lsa, ular
bilan yana urinadi).

## Zero-touch provisioning: qurilmani biriktirish (device claim)

`config.h`da `DEVICE_ID`/`DEVICE_KEY` endi **SHART EMAS** (ixtiyoriy fallback,
pastga qarang). Standart oqim — hech qanday qo'lda kiritish kerak emas:

1. Qurilmani flash qilib yoqasiz (WiFi'ni yuqoridagi captive-portal orqali
   sozlaganingizdan keyin).
2. `config.h`da `DEVICE_ID`/`DEVICE_KEY` bo'sh bo'lsa, qurilma NVS'da ham
   hech narsa topmaydi va **kutish rejimi**ga o'tadi: har ~5 soniyada
   avtorizatsiyasiz `POST /api/v1/devices/announce` so'rovini
   `{"chip_id": "<ESP.getEfuseMac()'dan olingan 12 xonali hex>"}` body bilan
   yuboradi. Bu bosqichda RF receiver YOQILMAGAN — SOS signal qabul
   qilinmaydi (qaysi xonaga tegishli ekani hali noma'lum).
3. Superadmin dashboard'da "Qurilmalar" (kashf qilingan qurilmalar
   ro'yxati) bo'limida shu chip ID'ni ko'radi va "Bog'lash" tugmasini
   bosib xonaga biriktiradi.
4. Qurilmaning KEYINGI announce so'roviga backend
   `{"claimed": true, "device_id": "...", "device_key": "..."}` deb javob
   qaytaradi. Firmware shu qiymatlarni ESP32 NVS (flash) xotirasiga
   saqlaydi va **qayta yuklanmasdan**, xotiradagi holatni yangilab, darhol
   asosiy (avtorizatsiyali) rejimga o'tadi: RF receiver yoqiladi, SOS
   chaqiruvlar, heartbeat va offline navbat normal ishlay boshlaydi.
5. Keyingi qayta yuklanishlarda qurilma NVS'da saqlangan device_id/
   device_key'ni topib to'g'ridan-to'g'ri asosiy rejimda ishga tushadi —
   announce so'ralmaydi.

Serial logda holatni kuzatish mumkin: `Chip ID: <hex>` → `Qurilma hali
biriktirilmagan — kutish rejimida...` → (bog'langandan keyin) `Qurilma
biriktirildi! device_id=..., endi asosiy rejimda ishlayapti`.

**Eski (qo'lda-sozlash) oqim hali ham ishlaydi**: agar `config.h`da
`DEVICE_ID` va `DEVICE_KEY` ikkalasi ham to'ldirilgan bo'lsa (masalan
avvaldan flash qilingan qurilmalar), qurilma NVS'da saqlangan zero-touch
qiymatlari bo'lmasa shu qiymatlarni fallback sifatida ishlatib, to'g'ridan-
to'g'ri asosiy rejimda ishga tushadi — hech narsa buzilmaydi.

**Qurilmani boshqa klinikaga ko'chirish**: pastdagi "WiFi'ni qayta sozlash
(BOOT tugmasi)" bilan bir xil amal — BOOT tugmasi 5 soniya WiFi
sozlamalari bilan birga saqlangan device_id/device_key'ni ham o'chiradi,
qurilma qayta yuklangach yana "kutish rejimi"ga tushadi.

## WiFi'ni qayta sozlash (BOOT tugmasi)

Qurilma boshqa klinikaga/tarmoqqa ko'chirilsa, saqlangan WiFi sozlamalarini
kompyutersiz o'chirish mumkin. Shu amal WiFi bilan birga saqlangan
device_id/device_key'ni (zero-touch orqali biriktirilgan bo'lsa) ham
tozalaydi — qurilma qayta yuklangach yana "kutish rejimi"ga (announce)
tushadi va yangi klinikada qaytadan "Bog'lash" kerak bo'ladi:

1. Qurilmani tokka ulang (yoki EN/reset bosing).
2. Yoqilgandan keyin darhol **BOOT tugmasini (GPIO0) 5 soniya uzluksiz
   bosib turing**.
3. Serial logda "WiFi sozlamalari o'chirildi (factory reset)" va "Qurilma
   biriktiruvi (device_id/device_key) ham tozalandi" xabarlari chiqadi,
   qurilma qayta yuklanadi va yana captive-portal ochadi.

Tugma 5 soniyadan oldin qo'yib yuborilsa, hech narsa o'chmaydi — qurilma
oddiy ishlashda davom etadi.

## Compile va flash qilish

Kompyuterda [PlatformIO](https://platformio.org/) o'rnatilgan bo'lishi kerak
(`pio` buyrug'i CLI orqali yoki VSCode PlatformIO plugin orqali).

Faqat compile qilish (uskuna ulanmagan bo'lsa ham sintaksis/mantiq tekshirish
uchun):

```bash
pio run
```

ESP32 kompyuterga USB orqali ulangandan keyin flash qilish:

```bash
pio run -t upload
```

Agar port avtomatik topilmasa, portni aniq ko'rsating:

```bash
pio run -t upload --upload-port /dev/tty.usbserial-XXXX
```

Flashdan keyin Serial Monitor orqali loglarni ko'rish (WiFi ulanish, qabul
qilingan RF kodlar, backendga yuborilgan so'rovlar va javob kodlari):

```bash
pio device monitor
```

(Baud rate `platformio.ini`da 115200 qilib sozlangan.)

## Ishlash mantiqi (qisqacha)

1. `setup()`: Serial'ni ishga tushiradi, BOOT tugmasi bosib turilganini
   tekshiradi (WiFi factory reset), WiFiManager `autoConnect()` bilan
   WiFi'ga ulanadi (saqlangan sozlamalar yoki captive-portal),
   `RCSwitch::enableReceive(RF_RECEIVER_PIN)` chaqirib RF qabulni yoqadi.
2. `loop()`:
   - WiFi holatini tekshiradi, uzilib qolgan bo'lsa `WiFi.reconnect()`
     bilan qayta ulanishga harakat qiladi (bloklamaydigan, 5 soniyalik
     interval bilan; sozlamalar NVS'dan olinadi).
   - **Heartbeat**: birinchi marta boot'dan keyin darhol, keyin har
     `HEARTBEAT_INTERVAL_MS`da (default 60 soniya)
     `POST /api/v1/devices/heartbeat` yuboriladi, body:
     `{"device_id": "<DEVICE_ID>"}`, header: `X-Device-Key`. Dashboard shu
     orqali qurilmaning online/offline holatini ko'rsatadi. Heartbeat
     xatoliklari faqat log qilinadi — tugma signalini hech qachon
     bloklamaydi.
   - **Offline navbat**: navbatda kutayotgan chaqiruvlar bo'lsa, har
     `RETRY_INTERVAL_MS`da eng eskisi qayta yuboriladi (quyiga qarang).
   - `mySwitch.available()` bo'lsa, kodni (`getReceivedValue()`) va bit
     uzunligini o'qiydi, EV1527 uchun kutilgan 24-bit ekanini tekshiradi.
   - **Debounce**: EV1527 tugma bosilganda signal RF remote xarakteriga
     ko'ra o'nlab marta takrorlanadi. Shuning uchun oxirgi yuborilgan
     kod+vaqt saqlanadi — agar bir xil kod `DEDUPE_WINDOW_MS` (default
     2000ms) ichida qayta kelsa, u e'tiborsiz qoldiriladi va serverga
     qayta so'rov yubormaydi.
   - Yangi (takroriy bo'lmagan) kod kelsa, `sendCallToServer()` orqali
     `POST https://SERVER_HOST:SERVER_PORT/api/v1/calls` so'rovi yuboriladi (TLS majburiy),
     body: `{"ev1527_code": <uint32>, "device_id": "<DEVICE_ID>"}`,
     header: `X-Device-Key: <DEVICE_KEY>`.
   - Javob kodi Serial'ga log qilinadi: `201` — chaqiruv qabul qilindi,
     `404` — kod noma'lum (backendda bu kodga bog'langan xona yo'q, shunchaki
     log qilinadi, ishlash davom etadi), `401` — device key noto'g'ri.

## Offline navbat: chaqiruv hech qachon yo'qolmaydi

WiFi uzilgan yoki server vaqtincha javob bermayotgan paytda bosilgan tugma
signali yo'qolmasligi uchun 8 ta joyli ring-buffer navbat ishlatiladi:

- Yuborish **vaqtinchalik** xato bilan tugasa (tarmoq/transport xatosi,
  timeout yoki HTTP `5xx`), kod navbatga qo'shiladi.
- `401` va `404` — **doimiy** xatolar (kalit noto'g'ri / kod noma'lum),
  qayta yuborish foydasiz, shuning uchun navbatga tushmaydi.
- Har `RETRY_INTERVAL_MS`da (default 5 soniya) navbatdagi eng eski kod
  qayta yuboriladi; muvaffaqiyat yoki doimiy xato — navbatdan chiqadi.
- `PENDING_MAX_AGE_MS`dan (default 2 daqiqa) eskirgan yozuvlar ogohlantirish
  logi bilan tashlab yuboriladi — juda kechikkan chaqiruv hamshira uchun
  foydasiz.
- Navbat to'la bo'lsa (8 ta), eng eski yozuv ogohlantirish bilan chiqarilib,
  yangi kod qo'shiladi — eng yangi chaqiruvlar muhimroq.

## Ishonchlilik (watchdog)

Bu tibbiy chaqiruv tizimi bo'lgani uchun, dastur biror joyda "qotib qolishi"
sababsiz jimlikka olib kelmasligi kerak:

- **Task watchdog** (`esp_task_wdt`, 30 soniya): `loop()` shu vaqt ichida
  kamida bir marta to'liq aylanib qaytmasa (masalan, WiFi/HTTP stack
  osilib qolsa), ESP32 avtomatik qayta yuklanadi. Captive-portal ochiq
  paytida `autoConnect()` bir necha daqiqa bloklanadi — shu davrga loop
  task watchdog'dan vaqtincha chiqariladi va ulanish tugagach qaytariladi.
- **Portal cheksiz ochiq turmaydi**: captive-portal 180 soniya ichida
  sozlanmasa, to'liq `ESP.restart()` qilinadi — NVS'da saqlangan eski
  sozlamalar bo'lsa, keyingi bootda ular bilan yana urinadi.
- **HTTP so'rovlarga timeout** (5 soniya connect + 5 soniya javob) —
  server javob bermasa, `loop()` cheksiz osilib qolmaydi.
- **Offline navbat** — tarmoq uzilgan paytdagi chaqiruv yo'qolmaydi,
  tarmoq tiklanganda qayta yuboriladi (yuqoridagi bo'limga qarang).

## Haqiqiy uskuna kelganda tekshirish ro'yxati

- [ ] RF receiver modulni sxemaga muvofiq ulang (VCC/GND/DATA→GPIO27)
- [ ] `src/config.h` ichida `SERVER_HOST`ni to'ldiring (`DEVICE_ID`/
      `DEVICE_KEY` bo'sh qoldirilishi mumkin — zero-touch, pastga qarang)
- [ ] `pio run -t upload` bilan flash qiling
- [ ] Telefondan `NurseCall-<chip ID>` AP'ga ulanib, captive-portal orqali
      klinika WiFi'sini sozlang
- [ ] `pio device monitor` orqali WiFi ulanishini va Serial logda "Chip ID: ..."
      hamda "kutish rejimida (announce)" xabarini tasdiqlang
- [ ] Superadmin dashboard'da "Qurilmalar" (kashf qilingan) ro'yxatida shu
      chip ID'ni ko'ring, xonaga "Bog'lash" bosing va Serial logda "Qurilma
      biriktirildi!" xabari chiqishini tasdiqlang
- [ ] Biriktirilgandan keyin birinchi heartbeat (`200`) yuborilganini
      tasdiqlang
- [ ] SOS tugmani bosib, Serial logda RF kod va bit uzunligi (24) chiqishini
      tekshiring
- [ ] Backendda shu `ev1527_code` xonaga bog'langanini tasdiqlang va
      Serial logda `201` javobi kelishini kuzating
- [ ] Dashboard'da qurilma "online" ko'rinishini tekshiring (heartbeat
      ishlayotganining belgisi)
- [ ] BOOT tugmasini 5 soniya bosib turib WiFi reset + qurilma biriktiruvi
      (device_id/device_key) tozalanishini sinab ko'ring
