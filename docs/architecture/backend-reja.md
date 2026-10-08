# NurseCall backend: arxitektura rejasi

2026-10-08. `main` holati: `a5c401b` (PR #1, #3, #4, #5 birlashtirilgan). Barcha server testlari o'tadi, qamrov 67%.

## Qisqa xulosa

Backendni noldan qayta yozish shart emas va xavfli. Kod allaqachon router → service → repository qatlamlariga bo'lingan, klinikalar bir-biridan ajratilgan va testlangan, chaqiruv yo'lidagi eng nozik joylar (atomar tasdiqlash, xona bo'yicha lock, `press_id` idempotentligi) to'g'ri qilingan. Noldan yozish shu yutuqlarni yo'qotib, ishlab turgan 5 xil klientni (veb, telefon, Windows, soat, ESP32) sindirish xavfini tug'diradi.

Muammo kodning sifatida emas, **tuzilishning bir nechta asosiy cheklovida**. Ularni bosqichma-bosqich, har biri alohida PR bilan, API'ni o'zgartirmasdan tuzatamiz. Har bir PR'dan keyin production ishlayveradi.

## 1. Hozirgi asosiy muammolar

| # | Muammo | Oqibati | Qayerda |
|---|---|---|---|
| A1 | Real vaqt (WebSocket) ro'yxati bitta jarayon xotirasida | Ikkinchi uvicorn worker qo'shib bo'lmaydi; fon ishlari (`jobs/`) dashboardga xabar yubora olmaydi, shuning uchun 12 soatda yopilgan (expired) chaqiruv ekranlardan o'zi yo'qolmaydi | `app/ws_manager.py`, `RUNBOOK.md:186` |
| A2 | Pool 8 ta ulanish, har bir HTTP so'rov 2 ta qo'shimcha query (staff + clinic) qiladi; WS sikli klientdan kelgan har bir xabarda bazaga boradi | Yuklama oshganda chaqiruv yo'li pool uchun navbatda turadi. (Broadcast'dagi eng og'ir qismi PR #3'da tuzatilgan.) | `core/deps.py`, `routers/ws.py`, `database.py` |
| A3 | Push va WS "yubor va unut": `asyncio.create_task` va `BackgroundTask` | Jarayon shu soniyada qayta ishga tushsa, push yo'qoladi va hech kim bilmaydi | `call_service.py`, `push_service.py` |
| A4 | Sozlamalar import paytida modul darajasidagi o'zgaruvchilardan o'qiladi, engine ham import paytida yaratiladi | Testlarda sozlamani almashtirish qiyin; ilova "factory"siz | `core/config.py`, `database.py`, `main.py` |
| A5 | Servislar `HTTPException` tashlaydi | Biznes mantiq HTTP'ga bog'langan; fon ishlari va WS'dan qayta ishlatib bo'lmaydi | deyarli barcha `services/` |
| A6 | Autentifikatsiya: 90 kunlik bitta JWT, refresh token yo'q; veb uni `localStorage`da saqlaydi | O'g'irlangan token 90 kun ishlaydi; XSS = token o'g'irlash | `core/security.py`, `web-dashboard/src/api/client.ts` |
| A7 | Ma'lumotlar modelidagi qoldiqlar: `push_tokens.expo_push_token` FCM tokenlarini ham saqlaydi; `calls.acknowledged_by` xodim ID emas, matn (ism); klinikada vaqt mintaqasi yo'q | Hisobotlar UTC bo'yicha (Toshkentda 5 soat siljiydi); "kim qabul qildi" ismga bog'liq | `models.py` |
| A8 | `admin_service.py` 808 qator, overview ~105 ta query | Superadmin paneli sekin, test qamrovi past | `services/admin_service.py` |
| A9 | Deploy: `root` orqali rsync, API'ning systemd unit fayli repoda yo'q, `--proxy-headers` tasdiqlanmagan | Rate limit hamma uchun bitta IP bo'yicha ishlashi mumkin; qayta tiklash qo'lda | `deploy.sh`, `deploy/` |
| A10 | Ildizda eski skriptlar: `migrate_v2/3/4.py`, `reset_db.py` | Production bazada adashib ishga tushirish xavfi | `server/` |

## 2. Maqsadli tuzilma

Qatlamlar o'zgarmaydi, faqat chegaralari aniq bo'ladi:

```
server/app/
  main.py              create_app() — faqat yig'ish
  settings.py          pydantic-settings, bitta Settings obyekti
  db.py                engine/session, get_db
  api/                 HTTP qatlami: routers, deps, xato → status xaritasi
    v1/ ...            hozirgi /api/v1 yo'llari aynan o'zgarishsiz
    web.py             landing, APK yuklab olish, SPA yo'llari (main.py'dan ko'chadi)
  domain/              servislar: HTTP'ni bilmaydi, DomainError tashlaydi
  repositories/        SQL shu yerda
  realtime/
    events.py          new_call / ack / expired / unassigned_* hodisalari (bitta joyda)
    bus.py             publish(): outbox + Postgres LISTEN/NOTIFY
    ws.py              ulanishlar ro'yxati (faqat yuborish, bazaga bormaydi)
    push.py            FCM/Expo yuborish, qayta urinish bilan
  jobs/                expire, renotify, offline, billing — hodisalarni bus orqali e'lon qiladi
```

### Real vaqt oqimi (eng muhim o'zgarish)

```
ESP32 → POST /api/v1/calls
          └─ bitta tranzaksiyada: calls qatori + events (outbox) qatori → COMMIT → NOTIFY
                                                                         │
API jarayoni(lari)dagi dispatcher ── LISTEN ◄────────────────────────────┘
          ├─ WS: shu klinikaning ulangan ekranlariga (xotiradagi ruxsat bilan)
          └─ push: FCM/Expo, muvaffaqiyatsiz bo'lsa qayta urinadi, natija outbox'da
```

Nima uchun Redis yoki boshqa navbat emas: Postgres allaqachon bor, `max_connections=25` cheklangan serverda yangi xizmat qo'shish ortiqcha. `LISTEN/NOTIFY` + outbox jadvali:
- push'lar jarayon qayta ishga tushganda ham yo'qolmaydi (A3);
- bir nechta uvicorn worker bir xil hodisani oladi, demak ikkinchi worker qo'shsa bo'ladi (A1);
- `jobs/expire_stale_calls` ham hodisa e'lon qiladi va ekranlar yangilanadi (A1).

### Autentifikatsiya

- Qisqa access token (15 daqiqa) + aylanib turuvchi refresh token (bazada xesh holida, qurilma bo'yicha bekor qilinadi).
- Veb: refresh token `HttpOnly` cookie'da, access token faqat xotirada; qat'iy CSP.
- Telefon/soat/Windows: refresh token secure storage'da.
- O'tish davri: eski 90 kunlik tokenlar muddati tugaguncha qabul qilinadi, shuning uchun yangilanmagan ilovalar ishlayveradi. `/api/v1/auth/login` javobiga yangi maydonlar faqat qo'shiladi.

### Ma'lumotlar modeli

- `push_tokens`: `token` + `platform` (`fcm`/`expo`) ustunlari; eski nom vaqtincha qoladi.
- `calls`: `acknowledged_by_staff_id` (FK) qo'shiladi, matnli `acknowledged_by` saqlanadi (eski yozuvlar va klientlar uchun).
- `clinics.timezone` (standart `Asia/Tashkent`): hisobotlar mahalliy vaqt bo'yicha.
- `events` (outbox): `id, clinic_id, type, payload jsonb, created_at, delivered_at, attempts`.

## 3. Nimalar o'zgarmaydi (kafolat)

- Barcha `/api/v1/...` yo'llari, so'rov va javob shakllari, status kodlari.
- `/ws/calls` va undagi hodisa turlari (`new_call`, `ack`, `unassigned_signal`, `unassigned_removed`) va maydonlari.
- ESP32 protokoli (`/calls`, `/devices/heartbeat`, `/devices/announce`), qurilma kalitlari.
- Billing chaqiruv yo'lini to'smasligi.

Buni 1-qadamdan boshlab **kontrakt testi** ushlab turadi: OpenAPI sxemasining surati repoda saqlanadi va har qanday o'zgarish CI'da ko'rinadi.

## 4. Bosqichlar (har biri alohida PR)

| Qadam | Nima | Klientlarga ta'siri |
|---|---|---|
| 1 | Shu reja + API kontrakt testi (barcha yo'llar, maydonlar, majburiy/ixtiyoriy belgisi surati) | yo'q |
| 2 | `Settings` obyekti, `create_app()`, `main.py`dan web/APK yo'llarini ajratish, eski skriptlarni olib tashlash (A4, A10) | yo'q |
| 3 | `DomainError` va bitta xato xaritasi, servislar HTTP'dan ajraladi (A5) | yo'q (status/matnlar bir xil) |
| 4 | `realtime/` paketi: outbox jadvali + LISTEN/NOTIFY dispatcher, push qayta urinish bilan, `expired` hodisasi (A1, A3) | yangi `expired` hodisasi; eski klientlar uni e'tiborsiz qoldiradi |
| 5 | Deploy: API unit fayli repoga, `--proxy-headers`, root bo'lmagan foydalanuvchi, 2 ta worker; autentifikatsiya keshi va WS siklini yengillatish (A2, A9) | yo'q |
| 6 | Ma'lumotlar modeli tozalash migratsiyalari (A7) | yo'q |
| 7 | Admin overview: `GROUP BY` bilan 3–4 query, mahalliy vaqt, servisni bo'lish (A8) | grafiklar to'g'ri vaqtda |
| 8 | Refresh token + veb cookie (A6) | ilovalar yangi versiyasi kerak, eskilari ishlayveradi |

Qilinmaydigan narsalar va sababi:
- **Async SQLAlchemy'ga o'tish.** Bloklovchi ish allaqachon threadpool'da; foydasi kichik, xavfi katta.
- **Mikroservislar, Docker majburiy emas.** Bitta server, bitta jamoa; monolit to'g'ri tanlov.
- **Yangi framework.** FastAPI yetarli.

## 5. Test va sifat

- Haqiqiy Postgres bilan testlar (hozirgidek) qoladi.
- Har bir qadam qamrov "ratchet"ini oshiradi (hozir 57%, haqiqiy 67%).
- 4-qadamdan keyin: bitta tugma bosilishidan WS va push'gacha bo'lgan oqimni to'liq tekshiruvchi test va 30 ta socket bilan yuklama testi.

## 6. Avval siz qiladigan ishlar (kod emas)

Bular hali ham ochiq bo'lishi mumkin: repo'ni private qilish, 2026-09-08 dagi `.env` sirlarini almashtirish (`JWT_SECRET`, DB paroli, `DEVICE_KEY_SECRET`, Telegram tokeni), xodim parollarini yangilash. Arxitektura ishi bularni kutmaydi, lekin bularsiz xavfsizlik bo'yicha har qanday yaxshilanish ikkinchi darajali.
