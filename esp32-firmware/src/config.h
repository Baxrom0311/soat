#pragma once

// ============================================================================
// config.h.example
//
// Bu faylni "config.h" nomiga ko'chiring va o'z qiymatlaringizni kiriting:
//   cp src/config.h.example src/config.h
//
// "config.h" fayli .gitignore ichida bo'lishi kerak (haqiqiy device key
// git repoga tushib qolmasligi uchun).
//
// DIQQAT: WiFi SSID/parol endi bu yerda saqlanmaydi — birinchi yoqilganda
// qurilma captive-portal (WiFiManager) ochadi va o'rnatuvchi telefondan
// klinika WiFi'sini tanlaydi; ma'lumotlar ESP32 NVS xotirasida saqlanadi.
//
// DIQQAT 2: DEVICE_ID/DEVICE_KEY'ni ham QO'LDA TO'LDIRISH SHART EMAS.
// Standart oqim — "zero-touch": qurilmani shunchaki flash qilib yoqasiz,
// u o'z apparat chip ID'si bilan serverga "men shu yerdaman" deb xabar
// beradi, superadmin dashboard'da "Bog'lash" tugmasini bosadi, va qurilma
// o'zi device_id+device_key'ni saqlab oladi — qayta flash shart emas.
// Quyidagi ikkalasini bo'sh ("") qoldiring, agar eski usulda (qo'lda,
// dashboard'da oldindan yaratilgan qiymatlar bilan) sozlamoqchi bo'lmasangiz.
// ============================================================================

// ---- Sozlash captive-portali (WiFiManager) ----
// Birinchi yoqilganda (yoki BOOT tugmasi bilan WiFi reset qilingandan keyin)
// qurilma "NurseCall-<DEVICE_ID>" nomli AP ochadi. Shu AP'ga ulanish paroli:
#define SETUP_AP_PASSWORD "nursecall123"

// ---- Backend server ----
// Markaziy nurse-call backend (FastAPI), HTTPS orqali (root_ca.h'dagi
// Let's Encrypt ildiz sertifikatlariga — ISRG Root X1 va X2 — ishonch bildiriladi).
#define SERVER_HOST "nurcecall.boos.uz"
#define SERVER_PORT 443
#define SERVER_PATH "/api/v1/calls"

// IXTIYORIY (zero-touch bilan SHART EMAS). To'ldirilsa, qurilma to'g'ridan-
// to'g'ri asosiy rejimda ishga tushadi (eski, qo'lda-sozlash oqimi — orqaga
// moslik uchun saqlangan). Bo'sh qoldirilsa (tavsiya etiladi), qurilma
// "kutish rejimi"da (announce) ishga tushadi va dashboard'da "Bog'lash"
// bosilgach o'zi device_id+device_key'ni oladi.
#define DEVICE_KEY ""

// IXTIYORIY (zero-touch bilan SHART EMAS) — qarang yuqoridagi izoh.
// To'ldirilsa, dashboard'da ro'yxatga olingan device_id bilan AYNAN bir
// xil bo'lishi kerak (masalan: "floor2-esp32-01").
#define DEVICE_ID ""

// ---- RF qabul qilgich (433MHz, masalan SRX882) ----
// Qabul qilgich DATA/OUT pini ulangan GPIO raqami.
#define RF_RECEIVER_PIN 27

// ---- Debounce ----
// Bir marta tugma bosilganda EV1527 kodi bir necha o'nlab marta takrorlanadi.
// Shu vaqt oralig'ida (millisekund) bir xil kod qayta kelsa, server yana
// so'rov yubormaydi.
#define DEDUPE_WINDOW_MS 2000

// ---- Heartbeat ----
// Qurilma har shu interval (ms)da serverga "tirikman" xabarini yuboradi —
// dashboard'da qurilmaning online/offline holati shunga qarab ko'rsatiladi.
// Xatoliklar faqat log qilinadi, tugma signallarini hech qachon bloklamaydi.
#define HEARTBEAT_PATH "/api/v1/devices/heartbeat"
#define HEARTBEAT_INTERVAL_MS 60000

// ---- Offline navbat (retry) ----
// Server vaqtincha yetib bo'lmas holatda bo'lsa (tarmoq uzilishi, 5xx),
// chaqiruv yo'qolmasligi uchun navbatga tushadi va har RETRY_INTERVAL_MS'da
// qayta uriniladi. PENDING_MAX_AGE_MS'dan eskirgan yozuvlar ogohlantirish
// bilan tashlab yuboriladi (juda kech yetib borgan chaqiruv foydasiz).
#define RETRY_INTERVAL_MS 5000
#define PENDING_MAX_AGE_MS 120000
