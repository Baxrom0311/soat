// ============================================================================
// Nurse-call ESP32 firmware
//
// Har qavatda turgan ESP32 433MHz RF receiver orqali bemor xonasidagi
// EV1527 protokolli SOS tugma signalini qabul qiladi va WiFi orqali
// markaziy backend serverga POST so'rov yuboradi.
//
// Arxitektura — IKKI task:
//   loop()      (core 1): faqat RF qabul + debounce + navbatga qo'shish.
//                Hech qachon tarmoq kutmaydi — TLS ulanish 10 soniya cho'zilsa
//                ham yangi tugma bosilishi o'tkazib yuborilmaydi (rc-switch
//                faqat BITTA dekodlangan qiymat saqlaydi, shuning uchun RF
//                o'qish kechiksa signal ustiga yozilib yo'qolishi mumkin edi).
//   networkTask (core 0): barcha HTTPS ishlari — chaqiruv yuborish, offline
//                retry-navbat, heartbeat. FreeRTOS queue orqali oziqlanadi.
//
// Har bosilishga noyob press_id beriladi: javob yo'qolib firmware qayta
// yuborsa, server press_id bo'yicha o'sha chaqiruvni qaytaradi — soxta
// dublikat chaqiruv yaratilmaydi.
//
// WiFi sozlamalari captive-portal (WiFiManager) orqali kiritiladi va ESP32
// NVS xotirasida saqlanadi — firmware ichida SSID/parol yo'q.
//
// Kutubxonalar: sui77/rc-switch (EV1527/PT2262 dekodlash), ArduinoJson
// (JSON body yasash), tzapu/WiFiManager (captive-portal provisioning),
// ESP32 core WiFi/HTTPClient.
// ============================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <RCSwitch.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include <time.h>

#include "config.h"
#include "root_ca.h"

// Ikkala task ham shu vaqt ichida kamida bir marta wdt_reset qilmasa
// (masalan, WiFi/HTTP stack qotib qolsa), ESP32 avtomatik qayta yuklanadi.
// Hamshira chaqiruvi hech qachon "sababsiz jim qolib" ketmasligi uchun muhim.
// Bitta HTTP amal eng ko'pi ~10s (5s connect + 5s read) — 30s yetarli zaxira.
static const uint32_t WDT_TIMEOUT_SEC = 30;

// Captive-portal shu vaqt ichida sozlanmasa (o'rnatuvchi kelmadi/adashdi),
// qurilma qayta yuklanadi — NVS'da eski to'g'ri sozlamalar bo'lsa, keyingi
// bootda ular bilan qayta urinadi.
static const uint32_t PORTAL_TIMEOUT_SEC = 180;

// GPIO0 — ESP32 DevKit'dagi BOOT tugmasi. Startup'dan keyin shu tugma
// FACTORY_RESET_HOLD_MS davomida uzluksiz bosib turilsa, saqlangan WiFi
// sozlamalari o'chiriladi (o'rnatuvchi qurilmani boshqa klinikaga ko'chirsa).
static const int BOOT_BUTTON_PIN = 0;
static const uint32_t FACTORY_RESET_HOLD_MS = 5000;

// mbedTLS TLS handshake root CA sertifikatining notBefore/notAfter maydonlarini
// tizim soatiga solishtirib tekshiradi. NTP bilan sinxronlanmasa, ESP32 soati
// bootdan keyin ~1970 atrofida qoladi va HAR BIR HTTPS chaqiruv "sertifikat hali
// yaroqli emas" bilan ABADIY muvaffaqiyatsiz bo'ladi — WiFi ulangan ko'rinsa ham.
static const uint32_t NTP_SYNC_TIMEOUT_MS = 15000;
// 2024-01-01 UTC dan oldingi vaqt = hali NTP bilan sinxronlanmagan degani.
static const time_t NTP_SANE_EPOCH = 1704067200;

// ---- Zero-touch provisioning (qurilma kashf qilish/biriktirish) ----
// Qurilma dashboard'da hali biriktirilmagan bo'lsa, config.h'dagi qo'lda
// kiritiladigan DEVICE_ID/DEVICE_KEY o'rniga apparat chip ID'sidan
// (ESP.getEfuseMac() — har bir ESP32 chip'da noyob, qo'lda kiritish shart
// emas) foydalanib serverga muntazam avtorizatsiyasiz "men shu yerdaman"
// (announce) so'rovi yuboradi. Superadmin dashboard'da "Bog'lash" tugmasini
// bosgach, KEYINGI announce javobida device_id+device_key qaytadi — shu
// NVS (flash) xotirasiga saqlanadi va qurilma qayta yuklanmasdan asosiy
// (avtorizatsiyali) rejimga o'tadi.
static const char *PROVISION_NVS_NAMESPACE = "nursecall";
static const char *ANNOUNCE_PATH = "/api/v1/devices/announce";
static const uint32_t ANNOUNCE_INTERVAL_MS = 5000;

static char g_chipId[13] = {0};    // 12 xonali kichik-harfli hex + '\0'
static String g_deviceId;          // asosiy rejimda ishlatiladigan device_id
static String g_deviceKey;         // asosiy rejimda ishlatiladigan device_key
static bool g_provisioned = false; // true => asosiy (avtorizatsiyali) rejim

RCSwitch mySwitch = RCSwitch();

// EV1527 tipidagi kodlar odatda 24 bit uzunlikda bo'ladi.
static const unsigned int EV1527_BIT_LENGTH = 24;

// ---- Debounce: kod boyicha kichik jadval ----
// Bitta o'zgaruvchi yetmaydi: ikki bemor BIR VAQTDA bossa, kadrlar A,B,A,B
// bo'lib almashib keladi va "oxirgi kod" debounce'i har kadrda yangi kod
// ko'rib, hammasini o'tkazib yuborar edi. 4 ta oxirgi kod eslab qolinadi.
struct DebounceEntry {
  unsigned long code;
  unsigned long lastSentAtMs;
};
static const size_t DEBOUNCE_TABLE_SIZE = 4;
static DebounceEntry debounceTable[DEBOUNCE_TABLE_SIZE] = {};

// ---- loop -> networkTask navbati ----
// press_id: "<DEVICE_ID>-<random8hex><millis8hex>" — server uchun idempotensiya kaliti.
struct QueuedPress {
  unsigned long code;
  char pressId[48];
};
// makePressId() "<device_id>-<8hex><8hex>\0" formatini pressId[48] ga yozadi:
// device_id_len + 1 + 8 + 8 + 1 <= 48 => device_id_len <= 30. Bir bayt zaxira
// bilan 29 -- undan uzun device_id snprintf tomonidan jimgina kesilib,
// press_id'ning noyoblik kafolatini zaiflashtiradi.
static const size_t MAX_DEVICE_ID_LEN = 29;
// 16 -> 48: bitta yuborish urinishi ~10s cho'zilishi mumkin (5s connect + 5s
// read), shu oraliqda ko'p bemor bir vaqtda bossa navbat to'lib, eng yangi
// bosishlar jimgina tashlab yuborilardi. Kattaroq chuqurlik bu holatni deyarli
// yo'qqa chiqaradi (48 ta struct ~2.5KB — ESP32 uchun arzimas xotira narxi).
static const int CALL_QUEUE_DEPTH = 48;
static QueueHandle_t callQueue = nullptr;

// pollAnnounce() (networkTask, core 0) qurilma biriktirilganda RF interruptni
// to'g'ridan-to'g'ri o'zi yoqmaydi -- shu bayroqni ko'taradi, uni faqat loop()
// (core 1) ko'rib mySwitch.enableReceive() chaqiradi. attachInterrupt() qaysi
// core'dan chaqirilsa, RF ISR o'sha core'ga bog'lanib qoladi; buni networkTask'dan
// chaqirish RF qabulni core 0'dagi bloklovchi HTTPS ishlariga bog'lab qo'yardi --
// fayl boshidagi ikki-core arxitektura kafolatini buzardi.
static volatile bool g_needsEnableReceive = false;

// Serverga yuborish natijasi: qayta urinishga arziydimi yoki yo'qmi.
// 401 (kalit noto'g'ri) va 404 (kod noma'lum) — doimiy xatolar; tarmoq
// xatosi, 5xx, 429 (rate limit) va 408 (timeout) — vaqtincha.
enum SendResult {
  SEND_OK,
  SEND_RETRYABLE,
  SEND_PERMANENT,
};

// Offline retry-navbat (faqat networkTask ichida ishlatiladi): tarmoq
// uzilganda yoki server vaqtincha xato qaytarganda chaqiruv yo'qolmasligi
// uchun shu ring bufferda saqlanadi. press_id saqlanib qolgani uchun kech
// yetib borgan retry serverda dublikat chaqiruv yaratmaydi.
struct PendingCall {
  unsigned long code;
  char pressId[48];
  unsigned long firstAttemptMs;
  uint8_t attempts;
};
// 8 -> 32: bir necha daqiqalik tarmoq uzilishida 8+ bemor chaqirsa, eng eski
// (ehtimol eng shoshilinch) chaqiruv navbatga yangi joy ochish uchun jimgina
// tashlab yuborilardi. Kattaroq chuqurlik buni deyarli yo'qqa chiqaradi.
static const size_t PENDING_QUEUE_SIZE = 32;
static PendingCall pendingQueue[PENDING_QUEUE_SIZE];
static size_t pendingHead = 0;  // eng eski yozuv indeksi
static size_t pendingCount = 0;

void checkWiFiFactoryReset();
void connectToWiFi();
void ensureWiFiConnected();
void syncTimeWithNtp();
String readCappedResponse(HTTPClient &http);
void computeChipId();
void loadProvisioningState();
void clearProvisioningState();
void pollAnnounce(unsigned long nowMs);
bool isDuplicate(unsigned long code, unsigned long nowMs);
void makePressId(char *out, size_t outSize);
void networkTask(void *arg);
SendResult sendCallToServer(unsigned long code, const char *pressId);
void maybeSendHeartbeat(unsigned long nowMs);
void sendHeartbeat();
void enqueuePending(unsigned long code, const char *pressId);
void dequeuePending();
void processPendingQueue(unsigned long nowMs);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("=== Nurse-call ESP32 firmware boshlanmoqda ===");

  computeChipId();
  Serial.printf("Chip ID: %s\n", g_chipId);

  // Factory reset tekshiruvi watchdog yoqilishidan OLDIN — tugma 5 soniya
  // ushlab turilganda watchdog aralashmasligi uchun.
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  checkWiFiFactoryReset();

  loadProvisioningState();
  if (g_provisioned) {
    Serial.printf("Device ID: %s (asosiy rejim)\n", g_deviceId.c_str());
  } else {
    Serial.println("Qurilma hali biriktirilmagan — kutish rejimida (announce) ishga tushmoqda...");
  }

  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  connectToWiFi();
  syncTimeWithNtp();

  callQueue = xQueueCreate(CALL_QUEUE_DEPTH, sizeof(QueuedPress));
  // Tarmoq ishlari core 0'da (WiFi stack ham shu yerda), loop() core 1'da qoladi.
  xTaskCreatePinnedToCore(networkTask, "network", 8192, nullptr, 1, nullptr, 0);

  if (g_provisioned) {
    mySwitch.enableReceive(RF_RECEIVER_PIN);
    Serial.printf("RF receiver GPIO%d pinda tinglanmoqda...\n", RF_RECEIVER_PIN);
  } else {
    // Hali qaysi xonaga tegishli ekani noma'lum — RF signal shu bosqichda
    // qabul qilinmaydi. Qurilma biriktirilgach (pollAnnounce ichida)
    // enableReceive() chaqiriladi.
    Serial.println("RF receiver hali YOQILMAGAN — qurilma dashboard'da biriktirilishini kutmoqda.");
  }
}

void loop() {
  esp_task_wdt_reset();
  ensureWiFiConnected();

  // Qurilma zero-touch orqali endigina biriktirilgan bo'lsa: RF interruptni
  // shu (core 1) core'dan o'zimiz yoqamiz, networkTask (core 0) emas -- shu
  // fayl boshidagi ikki-core arxitektura kafolatini saqlab qolish uchun.
  if (g_needsEnableReceive) {
    g_needsEnableReceive = false;
    mySwitch.enableReceive(RF_RECEIVER_PIN);
    Serial.printf("RF receiver GPIO%d pinda tinglanmoqda...\n", RF_RECEIVER_PIN);
  }

  if (mySwitch.available()) {
    unsigned long code = mySwitch.getReceivedValue();
    unsigned int bitLength = mySwitch.getReceivedBitlength();
    unsigned int protocol = mySwitch.getReceivedProtocol();

    mySwitch.resetAvailable();

    if (code == 0) {
      // getReceivedValue() 0 qaytarsa, dekodlashda xatolik bo'lgan (noise).
      Serial.println("RF signal qabul qilindi, lekin dekodlab bo'lmadi (shovqin?). O'tkazib yuborildi.");
      return;
    }

    if (bitLength != EV1527_BIT_LENGTH) {
      Serial.printf("Kutilmagan bit uzunligi (%u), EV1527 (%u) emas deb hisoblab o'tkazib yuborildi.\n",
                    bitLength, EV1527_BIT_LENGTH);
      return;
    }

    unsigned long nowMs = millis();
    if (isDuplicate(code, nowMs)) {
      return;  // takroriy kadr — jimgina tashlab yuboriladi (log ham shart emas, sekundiga o'nlab keladi)
    }

    Serial.printf("RF signal: code=%lu, bitLength=%u, protocol=%u\n", code, bitLength, protocol);

    QueuedPress press;
    press.code = code;
    makePressId(press.pressId, sizeof(press.pressId));

    // 0 timeout o'rniga qisqa (50ms) chegaralangan kutish: navbat 48 chuqurlikda
    // deyarli hech qachon to'lmaydi, lekin to'lib qolgan nodir holatda ham
    // networkTask'ga bitta slot bo'shatishga ozgina imkon beradi -- signalni
    // darhol tashlab yuborishdan ko'ra xavfsizroq. RCSwitch bitta dekodlangan
    // qiymatni ISR darajasida saqlaydi, shuning uchun 50ms bu buferni yo'qotish
    // xavfini sezilarli darajada oshirmaydi.
    if (xQueueSend(callQueue, &press, pdMS_TO_TICKS(50)) != pdTRUE) {
      Serial.println("OGOHLANTIRISH: chaqiruv navbati to'la, signal tashlab yuborildi!");
    }
  }
}

// Startup'dan keyin BOOT tugmasi (GPIO0) 5 soniya uzluksiz bosib turilsa,
// saqlangan WiFi sozlamalarini o'chiradi va qayta yuklanadi — keyingi bootda
// captive-portal ochiladi. O'rnatuvchilar uchun: qurilmani boshqa klinika
// tarmog'iga ko'chirishda kompyuter/flash kerak emas.
void checkWiFiFactoryReset() {
  if (digitalRead(BOOT_BUTTON_PIN) != LOW) {
    return;
  }

  Serial.println("BOOT tugmasi bosilgan — WiFi sozlamalarini o'chirish uchun 5 soniya ushlab turing...");
  unsigned long heldSinceMs = millis();
  while (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    delay(50);
    if (millis() - heldSinceMs >= FACTORY_RESET_HOLD_MS) {
      Serial.println("WiFi sozlamalari o'chirildi (factory reset).");
      WiFiManager wm;
      wm.resetSettings();
      // Qurilma biriktiruvini (device_id/device_key) ham tozalaymiz —
      // qurilma boshqa klinikaga ko'chirilganda qayta "kutish rejimi"ga
      // (announce) tushishi uchun.
      clearProvisioningState();
      Serial.println("Qurilma biriktiruvi (device_id/device_key) ham tozalandi.");
      // MUHIM: GPIO0 — strapping pin. Tugma hali bosib turilganda restart
      // qilinsa, chip ROM download rejimiga tushib "o'lik" ko'rinadi.
      // Shuning uchun avval tugma qo'yib yuborilishini kutamiz.
      Serial.println("Endi BOOT tugmasini QO'YIB YUBORING — qurilma qayta yuklanadi...");
      while (digitalRead(BOOT_BUTTON_PIN) == LOW) {
        delay(50);
      }
      delay(200);
      ESP.restart();
    }
  }
  Serial.println("BOOT tugmasi 5 soniyadan oldin qo'yib yuborildi, WiFi reset bekor qilindi.");
}

// WiFi'ga birinchi ulanish. WiFiManager avval NVS'dagi saqlangan sozlamalar
// bilan ulanishga urinadi; ulolmasa (yoki sozlamalar yo'q bo'lsa)
// "NurseCall-<device_id yoki chip ID>" nomli captive-portal AP ochadi —
// o'rnatuvchi telefondan ulanib klinika WiFi'sini tanlaydi. Portal
// PORTAL_TIMEOUT_SEC ichida sozlanmasa, qurilma qayta yuklanadi.
void connectToWiFi() {
  WiFi.mode(WIFI_STA);

  WiFiManager wm;
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_SEC);

  // SETUP_AP_NAME to'ldirilgan bo'lsa aynan shu ishlatiladi; bo'sh bo'lsa
  // (ko'p qurilmali o'rnatishlarda noyob bo'lishi uchun) chip ID'ga qaytiladi.
  String apName = String(SETUP_AP_NAME).length() > 0
      ? String(SETUP_AP_NAME)
      : String("NurseCall-") + (g_provisioned ? g_deviceId : String(g_chipId));
  Serial.printf("WiFi'ga ulanmoqda (saqlangan sozlamalar; bo'lmasa portal: %s)...\n", apName.c_str());

  // MUHIM: portal ochilsa autoConnect() bir necha daqiqagacha bloklanadi —
  // 30 soniyalik task watchdog shu paytda otib yubormasligi uchun loop
  // taskni watchdog'dan vaqtincha chiqarib turamiz, keyin qaytaramiz.
  esp_task_wdt_delete(NULL);

  bool connected = wm.autoConnect(apName.c_str(), SETUP_AP_PASSWORD);

  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  if (!connected) {
    Serial.println("Portal vaqti tugadi yoki WiFi'ga ulanib bo'lmadi, to'liq qayta yuklanmoqda...");
    delay(100);
    ESP.restart();
  }

  Serial.println();
  Serial.printf("WiFi ulandi. IP manzil: %s\n", WiFi.localIP().toString().c_str());
}

// WiFi ulangandan keyin, birinchi HTTPS chaqiruvdan OLDIN vaqtni NTP orqali
// sinxronlaydi -- aks holda TLS sertifikat tekshiruvi ~1970 yildagi soatga
// solishtirib "hali yaroqli emas" deb abadiy rad etadi. Timeout bilan
// chegaralangan: NTP portlari klinika tarmog'ida bloklangan bo'lsa ham qurilma
// abadiy osilib qolmaydi -- shunchaki ogohlantirib davom etadi (keyingi HTTPS
// chaqiruvlar muvaffaqiyatsiz bo'lib, odatdagi retry-navbat orqali qayta uriniladi).
void syncTimeWithNtp() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("NTP orqali vaqt sinxronlanmoqda");

  unsigned long startMs = millis();
  while (time(nullptr) < NTP_SANE_EPOCH) {
    esp_task_wdt_reset();
    if (millis() - startMs > NTP_SYNC_TIMEOUT_MS) {
      Serial.println("\nOGOHLANTIRISH: NTP vaqt sinxronizatsiyasi vaqti tugadi -- TLS chaqiruvlar muvaffaqiyatsiz bo'lishi mumkin.");
      return;
    }
    delay(250);
    Serial.print(".");
  }

  time_t now = time(nullptr);
  Serial.printf("\nVaqt sinxronlandi: %s", ctime(&now));
}

// Loop ichida chaqiriladi: agar WiFi uzilib qolgan bo'lsa, qayta ulanishga
// harakat qiladi. Interval 15s — sekin DHCP'li klinika tarmoqlarida har 5s
// reconnect chaqirish hali tugamagan assotsiatsiyani uzib, qurilmani abadiy
// "ulanmoqda" holatida qoldirishi mumkin edi. Sozlamalar NVS'da saqlangani
// uchun WiFi.reconnect() yetarli — SSID/parol keraksiz.
void ensureWiFiConnected() {
  static unsigned long lastReconnectAttemptMs = 0;
  const unsigned long RECONNECT_INTERVAL_MS = 15000;

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long nowMs = millis();
  if (nowMs - lastReconnectAttemptMs < RECONNECT_INTERVAL_MS) {
    return;
  }
  lastReconnectAttemptMs = nowMs;

  Serial.println("WiFi ulanishi uzilgan, qayta ulanishga harakat qilinmoqda...");
  WiFi.reconnect();
}

// ESP32 chip'ning 48-bitli noyob apparat MAC'idan (ESP.getEfuseMac()) 12
// xonali kichik-harfli hex ID yasaydi. Har bir ESP32 chip'da o'zi noyob —
// hech qanday qo'lda kiritish yoki flash paytida sozlash shart emas.
void computeChipId() {
  uint64_t mac = ESP.getEfuseMac();
  uint32_t hi = (uint32_t)((mac >> 32) & 0xFFFFULL);
  uint32_t lo = (uint32_t)(mac & 0xFFFFFFFFULL);
  snprintf(g_chipId, sizeof(g_chipId), "%04x%08x", (unsigned)hi, (unsigned)lo);
}

// Provisioning holatini aniqlaydi:
//   1) NVS'da saqlangan device_id+device_key bo'lsa (oldin announce orqali
//      biriktirilgan) — ular ishlatiladi.
//   2) Bo'lmasa, config.h'dagi qo'lda kiritilgan DEVICE_ID/DEVICE_KEY
//      (bo'sh bo'lmasa) — eski, qo'lda-sozlangan qurilmalar bilan orqaga
//      moslik uchun fallback.
//   3) Ikkalasi ham bo'sh bo'lsa — qurilma "kutish rejimi"da (announce)
//      qoladi, g_provisioned false bo'lib qoladi.
void loadProvisioningState() {
  Preferences prefs;
  prefs.begin(PROVISION_NVS_NAMESPACE, true);
  String storedId = prefs.getString("device_id", "");
  String storedKey = prefs.getString("device_key", "");
  prefs.end();

  if (storedId.length() > 0 && storedKey.length() > 0) {
    g_deviceId = storedId;
    g_deviceKey = storedKey;
    g_provisioned = true;
    return;
  }

  if (strlen(DEVICE_ID) > 0 && strlen(DEVICE_KEY) > 0) {
    g_deviceId = DEVICE_ID;
    g_deviceKey = DEVICE_KEY;
    g_provisioned = true;
    return;
  }

  g_provisioned = false;
}

// Factory reset paytida (checkWiFiFactoryReset) WiFi sozlamalari bilan
// birga chaqiriladi — qurilma biriktiruvini butunlay o'chiradi.
void clearProvisioningState() {
  Preferences prefs;
  prefs.begin(PROVISION_NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
}

// "Kutish rejimi"da (hali biriktirilmagan, g_provisioned == false) har
// ANNOUNCE_INTERVAL_MS'da avtorizatsiyasiz "men shu yerdaman" so'rovi
// yuboradi. Superadmin dashboard'da "Bog'lash" tugmasini bosgach, KEYINGI
// javobda device_id+device_key qaytadi — shu yerda NVS'ga saqlanadi va
// qurilma qayta yuklanmasdan asosiy rejimga o'tadi (mySwitch.enableReceive
// shu yerdan chaqiriladi).
void pollAnnounce(unsigned long nowMs) {
  static unsigned long lastAnnounceMs = 0;
  if (nowMs - lastAnnounceMs < ANNOUNCE_INTERVAL_MS) {
    return;
  }
  lastAnnounceMs = nowMs;

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  WiFiClientSecure secureClient;
  secureClient.setCACert(LETSENCRYPT_ROOT_CA);

  HTTPClient http;
  String url = String("https://") + SERVER_HOST + ":" + String(SERVER_PORT) + ANNOUNCE_PATH;
  http.begin(secureClient, url);
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["chip_id"] = g_chipId;
  String body;
  serializeJson(doc, body);

  Serial.printf("Announce: POST %s -> %s\n", url.c_str(), body.c_str());
  int httpCode = http.POST(body);

  if (httpCode <= 0) {
    Serial.printf("Announce so'rovi muvaffaqiyatsiz, xatolik: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    return;
  }

  String response = readCappedResponse(http);
  http.end();

  if (httpCode != 200) {
    Serial.printf("Announce kutilmagan javob kodi (%d): %s\n", httpCode, response.c_str());
    return;
  }

  JsonDocument resp;
  DeserializationError err = deserializeJson(resp, response);
  if (err) {
    Serial.printf("Announce javobini JSON qilib o'qib bo'lmadi: %s\n", err.c_str());
    return;
  }

  bool claimed = resp["claimed"] | false;
  if (!claimed) {
    Serial.println("Kutish rejimida (hali biriktirilmagan)...");
    return;
  }

  const char *newDeviceId = resp["device_id"] | "";
  const char *newDeviceKey = resp["device_key"] | "";

  if (strlen(newDeviceId) == 0) {
    Serial.println("XATO: announce claimed=true qaytardi, lekin device_id bo'sh. Qayta urinishda davom etilmoqda.");
    return;
  }
  if (strlen(newDeviceKey) == 0) {
    // Contract: bu holat asosan xato — biz hali NVS'ga hech narsa
    // saqlamaganmiz (aks holda g_provisioned allaqachon true bo'lardi),
    // shuning uchun "eski kalitni davom ettirish" imkoni yo'q — faqat
    // log qilib qayta urinishda davom etamiz.
    Serial.println("OGOHLANTIRISH: device_key bo'sh qaytdi (kutilmagan holat). Qayta urinishda davom etilmoqda.");
    return;
  }
  if (strlen(newDeviceId) > MAX_DEVICE_ID_LEN) {
    // makePressId() "%s-%08x%08x" formatida g_deviceId'ni 48 baytli buferga
    // yozadi -- juda uzun device_id snprintf tomonidan jimgina kesib
    // tashlanadi va press_id'ning noyoblik kafolati zaiflashadi. Bunday
    // qurilmani biriktirmasdan, qayta urinishda davom etamiz.
    Serial.printf(
        "XATO: server juda uzun device_id qaytardi (%u belgi, max %u) -- press_id kesilib "
        "ketmasligi uchun rad etildi. Qayta urinishda davom etilmoqda.\n",
        (unsigned)strlen(newDeviceId), (unsigned)MAX_DEVICE_ID_LEN);
    return;
  }

  Preferences prefs;
  prefs.begin(PROVISION_NVS_NAMESPACE, false);
  prefs.putString("device_id", newDeviceId);
  prefs.putString("device_key", newDeviceKey);
  prefs.end();

  g_deviceId = newDeviceId;
  g_deviceKey = newDeviceKey;
  g_provisioned = true;

  Serial.printf("Qurilma biriktirildi! device_id=%s, endi asosiy rejimda ishlayapti\n", newDeviceId);

  // mySwitch.enableReceive() bu yerda (networkTask, core 0) emas -- loop()
  // (core 1) da chaqiriladi, chunki attachInterrupt() RF ISR'ni chaqirgan
  // core'ga bog'laydi. Shu bayroq loop()'ga signal beradi.
  g_needsEnableReceive = true;
}

// Kod DEDUPE_WINDOW_MS ichida qayta kelsa true — tugma bosilganda RF remote
// kadrni o'nlab marta takrorlaydi. Jadval bir nechta kodni eslab qoladi,
// shuning uchun ikki tugma bir vaqtda bosilsa ham har biri faqat bir marta
// navbatga tushadi. Yangi kod eng eski yozuv o'rniga yoziladi.
bool isDuplicate(unsigned long code, unsigned long nowMs) {
  size_t oldestIdx = 0;
  unsigned long oldestAgeMs = 0;
  for (size_t i = 0; i < DEBOUNCE_TABLE_SIZE; i++) {
    if (debounceTable[i].code == code) {
      if (nowMs - debounceTable[i].lastSentAtMs < (unsigned long)DEDUPE_WINDOW_MS) {
        return true;
      }
      debounceTable[i].lastSentAtMs = nowMs;
      return false;
    }
    // Xom lastSentAtMs qiymatlarini to'g'ridan-to'g'ri solishtirish millis()
    // ~49.7 kunlik overflow chegarasida xronologik tartibni teskari qilib
    // qo'yishi mumkin edi. Ayirma asosidagi "yosh" hisobi unsigned
    // arifmetika tufayli overflow'ga chidamli.
    unsigned long ageMs = nowMs - debounceTable[i].lastSentAtMs;
    if (ageMs >= oldestAgeMs) {
      oldestAgeMs = ageMs;
      oldestIdx = i;
    }
  }
  debounceTable[oldestIdx].code = code;
  debounceTable[oldestIdx].lastSentAtMs = nowMs;
  return false;
}

// Har bosilish uchun noyob idempotensiya kaliti. Server shu kalit bo'yicha
// takroriy yuborishni taniydi (javob yo'qolganda ham dublikat bo'lmaydi).
void makePressId(char *out, size_t outSize) {
  snprintf(out, outSize, "%s-%08x%08x", g_deviceId.c_str(), (unsigned)esp_random(), (unsigned)millis());
}

// http.getString() javob tanasini hech qanday hajm chegarasiz to'liq String'ga
// yuklaydi. Backend'ning o'zi kichik JSON javob qaytaradi, lekin noto'g'ri
// ishlagan/almashtirilgan server (yoki shu ildiz sertifikatiga ishonadigan
// boshqa xost) o'zboshimchalik bilan katta javob yuborsa, bu ESP32 heap'ini
// tugatib qo'yishi mumkin edi. Ma'lum (Content-Length'dan) va katta bo'lsa,
// o'qimasdan rad etamiz; noma'lum uzunlik (chunked) bo'lsa odatdagidek o'qiladi.
static const int MAX_RESPONSE_BYTES = 8192;

String readCappedResponse(HTTPClient &http) {
  int len = http.getSize();
  if (len > MAX_RESPONSE_BYTES) {
    Serial.printf("OGOHLANTIRISH: server javobi juda katta (%d bayt), o'qilmadi.\n", len);
    return String();
  }
  return http.getString();
}

// ---- Tarmoq taski (core 0) ----
// Barcha bloklovchi HTTPS ishlari faqat shu yerda: navbatdan chaqiruv olish,
// retry-navbat, heartbeat. Har amal orasida watchdog to'ydiriladi — bitta
// amal maksimal ~10s, WDT esa 30s.
void networkTask(void *arg) {
  (void)arg;
  esp_task_wdt_add(NULL);

  for (;;) {
    esp_task_wdt_reset();

    if (!g_provisioned) {
      // Hali biriktirilmagan: faqat announce so'raladi — SOS/heartbeat/
      // offline navbat mantiqi ishlamaydi (qaysi xonaga tegishli ekani
      // hali noma'lum, callQueue ham hech qachon to'lmaydi chunki RF
      // receiver bu bosqichda yoqilmagan).
      pollAnnounce(millis());
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    QueuedPress press;
    if (xQueueReceive(callQueue, &press, pdMS_TO_TICKS(1000)) == pdTRUE) {
      SendResult result = sendCallToServer(press.code, press.pressId);
      if (result == SEND_RETRYABLE) {
        // Tarmoq/server vaqtincha ishlamayapti — chaqiruv yo'qolmasligi
        // uchun navbatga qo'yamiz, tarmoq tiklanganda qayta yuboriladi.
        enqueuePending(press.code, press.pressId);
      }
    }

    unsigned long nowMs = millis();
    esp_task_wdt_reset();
    processPendingQueue(nowMs);
    esp_task_wdt_reset();
    maybeSendHeartbeat(nowMs);
  }
}

// EV1527 kodini backendga POST qiladi va javobni Serial'ga log qiladi.
// Natija sifatida xatoning turini qaytaradi: tarmoq xatosi, 5xx, 429, 408 —
// SEND_RETRYABLE (navbatga tushadi), 401/404 va boshqa 4xx — SEND_PERMANENT
// (qayta yuborish foydasiz).
SendResult sendCallToServer(unsigned long code, const char *pressId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi ulanmagan, so'rov yuborilmadi.");
    return SEND_RETRYABLE;
  }

  WiFiClientSecure secureClient;
  secureClient.setCACert(LETSENCRYPT_ROOT_CA);

  HTTPClient http;
  String url = String("https://") + SERVER_HOST + ":" + String(SERVER_PORT) + SERVER_PATH;

  http.begin(secureClient, url);
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", g_deviceKey.c_str());

  JsonDocument doc;
  doc["ev1527_code"] = code;
  doc["device_id"] = g_deviceId;
  doc["press_id"] = pressId;

  String body;
  serializeJson(doc, body);

  Serial.printf("POST %s -> %s\n", url.c_str(), body.c_str());

  int httpCode = http.POST(body);
  SendResult result;

  if (httpCode > 0) {
    String response = readCappedResponse(http);
    if (httpCode == 201) {
      Serial.printf("OK (201): chaqiruv qabul qilindi. Javob: %s\n", response.c_str());
      result = SEND_OK;
    } else if (httpCode == 404) {
      Serial.printf("XATO (404): kod noma'lum, xona topilmadi. Javob: %s\n", response.c_str());
      result = SEND_PERMANENT;
    } else if (httpCode == 401) {
      Serial.printf("XATO (401): X-Device-Key noto'g'ri. Javob: %s\n", response.c_str());
      result = SEND_PERMANENT;
    } else if (httpCode >= 500 || httpCode == 429 || httpCode == 408) {
      // 429/408 — reverse-proxy/CDN'ning vaqtinchalik javoblari, retry to'g'ri.
      Serial.printf("Vaqtinchalik xato (%d), keyinroq qayta uriniladi. Javob: %s\n", httpCode, response.c_str());
      result = SEND_RETRYABLE;
    } else {
      Serial.printf("Kutilmagan javob kodi (%d). Javob: %s\n", httpCode, response.c_str());
      result = SEND_PERMANENT;
    }
  } else {
    Serial.printf("So'rov muvaffaqiyatsiz tugadi, xatolik: %s\n", http.errorToString(httpCode).c_str());
    result = SEND_RETRYABLE;
  }

  http.end();
  return result;
}

// Heartbeat vaqtini kuzatadi: birinchi marta boot'dan keyin darhol (WiFi
// ulanishi bilan), keyin har HEARTBEAT_INTERVAL_MS'da yuboradi. Xatoliklar
// faqat log qilinadi — heartbeat hech qachon tugma signalini bloklamaydi.
void maybeSendHeartbeat(unsigned long nowMs) {
  static unsigned long lastHeartbeatMs = 0;
  static bool firstSent = false;

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (firstSent && nowMs - lastHeartbeatMs < (unsigned long)HEARTBEAT_INTERVAL_MS) {
    return;
  }

  lastHeartbeatMs = nowMs;
  firstSent = true;
  sendHeartbeat();
}

// Serverga "tirikman" xabarini POST qiladi — dashboard'da qurilmaning
// online/offline holati devices.last_seen_at ustuni orqali ko'rsatiladi.
void sendHeartbeat() {
  WiFiClientSecure secureClient;
  secureClient.setCACert(LETSENCRYPT_ROOT_CA);

  HTTPClient http;
  String url = String("https://") + SERVER_HOST + ":" + String(SERVER_PORT) + HEARTBEAT_PATH;

  http.begin(secureClient, url);
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", g_deviceKey.c_str());

  JsonDocument doc;
  doc["device_id"] = g_deviceId;

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);

  if (httpCode == 200) {
    Serial.println("Heartbeat yuborildi (200).");
  } else if (httpCode > 0) {
    Serial.printf("Heartbeat kutilmagan javob kodi qaytardi (%d).\n", httpCode);
  } else {
    Serial.printf("Heartbeat yuborilmadi, xatolik: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// Kodni offline retry-navbatga qo'shadi. Navbat to'la bo'lsa, eng eski yozuv
// ogohlantirish bilan tashlab yuboriladi — eng yangi chaqiruvlar muhimroq.
void enqueuePending(unsigned long code, const char *pressId) {
  if (pendingCount == PENDING_QUEUE_SIZE) {
    Serial.printf("OGOHLANTIRISH: offline navbat to'la, eng eski kod %lu tashlab yuborildi.\n",
                  pendingQueue[pendingHead].code);
    dequeuePending();
  }

  size_t tail = (pendingHead + pendingCount) % PENDING_QUEUE_SIZE;
  pendingQueue[tail].code = code;
  snprintf(pendingQueue[tail].pressId, sizeof(pendingQueue[tail].pressId), "%s", pressId);
  pendingQueue[tail].firstAttemptMs = millis();
  pendingQueue[tail].attempts = 1;
  pendingCount++;

  Serial.printf("Kod %lu offline navbatga qo'shildi (navbatda %u ta).\n", code, (unsigned)pendingCount);
}

// Eng eski yozuvni navbatdan chiqaradi.
void dequeuePending() {
  if (pendingCount == 0) {
    return;
  }
  pendingHead = (pendingHead + 1) % PENDING_QUEUE_SIZE;
  pendingCount--;
}

// Har RETRY_INTERVAL_MS'da navbatdagi ENG ESKI chaqiruvni qayta yuborishga
// harakat qiladi — tarmoq tiklanganda navbat asta-sekin bo'shaydi.
// PENDING_MAX_AGE_MS'dan eskirgan yozuvlar ogohlantirish bilan tashlab
// yuboriladi (juda kechikkan chaqiruv hamshira uchun foydasiz; press_id
// tufayli yetib borgan-lekin-javobsiz qolgan retry'lar dublikat yaratmaydi).
void processPendingQueue(unsigned long nowMs) {
  static unsigned long lastRetryMs = 0;

  if (pendingCount == 0) {
    return;
  }
  if (nowMs - lastRetryMs < (unsigned long)RETRY_INTERVAL_MS) {
    return;
  }
  lastRetryMs = nowMs;

  // Eskirgan yozuvlarni tashlab yuborish.
  while (pendingCount > 0) {
    PendingCall &oldest = pendingQueue[pendingHead];
    if (nowMs - oldest.firstAttemptMs < (unsigned long)PENDING_MAX_AGE_MS) {
      break;
    }
    Serial.printf("OGOHLANTIRISH: kod %lu %u urinishdan keyin ham yuborilmadi (%lu ms eskirdi), tashlab yuborildi.\n",
                  oldest.code, oldest.attempts, nowMs - oldest.firstAttemptMs);
    dequeuePending();
  }

  if (pendingCount == 0 || WiFi.status() != WL_CONNECTED) {
    return;
  }

  PendingCall &oldest = pendingQueue[pendingHead];
  oldest.attempts++;
  Serial.printf("Navbatdagi chaqiruvni qayta yuborish (urinish %u): kod=%lu\n",
                oldest.attempts, oldest.code);

  esp_task_wdt_reset();
  SendResult result = sendCallToServer(oldest.code, oldest.pressId);
  if (result != SEND_RETRYABLE) {
    // Muvaffaqiyat yoki doimiy xato (401/404) — ikkalasida ham navbatdan
    // chiqadi, qayta urinish hech narsani o'zgartirmaydi.
    dequeuePending();
  }
}
