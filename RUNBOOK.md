# NurseCall — ishga tushirish va tiklash qo'llanmasi

Bu hujjat bitta savolga javob beradi: **agar bugun loyihani boshqa odam davom ettirishi kerak bo'lsa, unga nima bilish kerak?**

Hozirgi holat: to'rtta klinika shu tizimga bog'langan, va serverga kirish kaliti, imzolash kaliti, Firebase hisobi, DigitalOcean akkaunti hamda tizimning qanday ishlashi haqidagi bilim **bitta odamda**. Bu texnik qarz emas, tashkiliy qarz. Quyidagisi uning yarmini yopadi.

> Bu faylda **hech qanday parol yoki kalit yo'q** va bo'lmasligi ham kerak. Faqat ular *qayerda* turgani yozilgan.

---

## 1. Tizim nimadan iborat

| Komponent | Qayerda | Nima qiladi |
|---|---|---|
| ESP32 qabul qilgich | klinikalarda, devorda | 433 MHz tugma signalini eshitib, serverga HTTP yuboradi |
| Server (FastAPI) | `67.205.171.93` | yagona haqiqat manbasi; Postgres bilan |
| Veb-panel | `nurcecall.boos.uz/app` | klinika xodimi va superadmin uchun |
| Telefon ilovasi | hamshiralar telefonida | chaqiruvni ko'rsatadi, budilnik rejimida ogohlantiradi |
| Palata soati | Wear OS | xuddi shu, bilakda |

Chaqiruvning yo'li: **tugma → ESP32 → `POST /api/v1/calls` → baza → WebSocket + FCM push → telefon va soat**.

---

## 2. Kirish va kalitlar qayerda

| Nima | Qayerda | Eslatma |
|---|---|---|
| Server SSH | `ssh -i ~/docean root@67.205.171.93` | kalit faqat Baxromning Macida |
| Server sozlamalari | `/root/nursecall_backend/.env` | `0600`, root. JWT kaliti, DB paroli, ntfy mavzusi |
| Firebase xizmat hisobi | `/root/nursecall_backend/firebase-service-account.json` | `0600`, root. Push uchun |
| Android imzolash kaliti | `mobile-flutter/android/keystores/release.keystore` | `keystore.properties` bilan. **Gitda yo'q.** Yo'qolsa, ilovani yangilab bo'lmaydi — faqat yangi nom bilan qaytadan chiqariladi |
| Postgres paroli | `.env` ichida va `/root/.pgpass` da | ikkalasi birga almashtiriladi |
| DigitalOcean, GitHub, Firebase konsoli | Baxromning hisoblari | **zaxira kirish yo'q** |

**Birinchi navbatdagi ish:** imzolash kalitini va `.env` ni boshqa joyga nusxalash. Server yo'qolsa `.env` tiklanadi; imzolash kaliti yo'qolsa — tiklanmaydi.

---

## 3. Kundalik ishlar

### Yangi versiyani chiqarish

```bash
cd ~/ish_full/soat
./server/deploy.sh                 # iflos katalogda yoki qizil testda ishga tushmaydi
```

Skript o'zi: testlarni yugurtiradi, dashboardni yig'adi, **kod va bazani nusxalaydi**, yuboradi, migratsiya qiladi, qayta ishga tushiradi, sog'liqni tekshiradi. Shulardan birortasi yiqilsa — eski versiyani o'zi qaytaradi.

```bash
./server/deploy.sh --dry-run       # nima o'zgarishini ko'rish
./server/deploy.sh --rollback      # oxirgi nusxaga qaytish
```

### Mobil ilova

```bash
cd mobile-flutter
# pubspec.yaml dagi versiyani oshiring — versionCode prodnikidan KATTA bo'lishi shart
flutter build apk --release
scp -i ~/docean build/app/outputs/flutter-apk/app-release.apk \
    root@67.205.171.93:/root/nursecall_backend/static/nursecall-test.apk
```

Imzo mos kelmasa Android `App not installed` deydi va sababini aytmaydi.

### Soat ilovasi

```bash
./gradlew :app:assembleRelease
./app/install-watch.sh 192.168.x.x:5555        # soat Wi-Fi orqali, USB yo'q
./app/install-watch.sh 192.168.x.x:5555 --sign-in hamshira@klinika.uz
```

---

## 4. Nimadir buzilganda

### "Chaqiruv kelmayapti"

Tartib bo'yicha tekshiring — yuqoridan pastga, chunki pastdagi nosozlik yuqoridagidek ko'rinadi:

```bash
# 1. Server tirikmi?
curl -s -o /dev/null -w '%{http_code}\n' https://nurcecall.boos.uz/health

# 2. Qabul qilgich eshityaptimi? (eng ko'p uchraydigan sabab)
ssh -i ~/docean root@67.205.171.93 \
  "cd /root/nursecall_backend && .venv/bin/python -c \"
from app.database import SessionLocal
from app.models import Device
from datetime import datetime, timezone
db=SessionLocal()
for d in db.query(Device).all():
    t = d.last_seen_at
    print(d.device_id, d.floor, t and (datetime.now(timezone.utc)-t).seconds//60, 'daqiqa oldin')
\""

# 3. Tugma xonaga biriktirilganmi?
#    Telefon ilovasida: Profil > Klinika sozlamalari > Tugmalar
```

**Jim qolgan qabul qilgich eng yomon nosozlik**, chunki hech qayerdan ko'rinmaydi — panelda chaqiruv yo'q, bu esa tinch palataga o'xshaydi. Bir klinika shu holatda **uch yarim kun** qolgan va hech kim bilmagan. Hozir server buni o'zi aytadi (ntfy), va telefon ilovasida ham ko'rinadi.

### "Hamshira tizimga kira olmayapti"

```bash
# Parolni tiklash (admin o'zi ham qila oladi, veb-panelda)
ssh -i ~/docean root@67.205.171.93 "cd /root/nursecall_backend && .venv/bin/python -c \"
from app.database import SessionLocal
from app.models import Staff
from app.core.security import hash_password
db=SessionLocal()
s=db.query(Staff).filter(Staff.email=='EMAIL').first()
s.password_hash=hash_password('YANGI_PAROL'); db.commit(); print('ok')
\""
```

### Server butunlay yiqilsa

```bash
# 1. Oxirgi backup — kuniga bir marta 03:15 UTC, ikki nusxada
ssh -i ~/docean root@67.205.171.93 'ls -lt /root/nursecall_backups/*.sql.gz | head -3'
#    ikkinchi nusxa: /mnt/volume_nyc1_.../nursecall_backups/

# 2. Backup haqiqatan ishlashini tekshirish (oyiga bir marta qilinishi kerak)
ssh -i ~/docean root@67.205.171.93 '/root/nursecall_backend/deploy/scripts/restore_check.sh'
```

Yangi serverga tiklash: Postgres o'rnatish → bazani yaratish → dumpni `gunzip | psql` bilan tiklash → `.env` ni qo'yish → `deploy.sh` → `deploy/` dagi systemd unitlarini `/etc/systemd/system/` ga ko'chirib `enable --now` qilish.

---

## 5. O'z-o'zidan ishlaydigan narsalar

`server/deploy/README.md` da har birining batafsili bor.

| Timer | Qachon | Nima qiladi |
|---|---|---|
| `nursecall-renotify` | har daqiqa | javobsiz chaqiruv haqida qayta ogohlantiradi |
| `nursecall-device-offline` | har 10 daqiqa | jim qolgan qabul qilgich haqida xabar |
| `nursecall-expire-calls` | har soat | 12 soatdan oshgan chaqiruvni yopadi |
| `nursecall-backup` | 03:15 UTC | baza nusxasi, ikki joyga |
| `nursecall-uptime` | har 5 daqiqa | sayt javob bermasa xabar |
| `nursecall-billing-warn` | 05:30 UTC | obunasi tugayotgan klinikalar |
| `nursecall-latency-report` | 06:00 UTC | chaqiruv kechikishi hisoboti |

Hammasi **ntfy** ga yozadi. Mavzu `.env` dagi `NTFY_TOPIC_URL` da — telefoningizga ntfy ilovasini o'rnatib, o'sha mavzuga obuna bo'ling.

---

## 5a. `main` himoyasi

Hozir yoqilgani — **admin uchun ham**:

- `main` ni o'chirib bo'lmaydi
- `main` ga force-push qilib bo'lmaydi (tarixni qayta yozish tasodifan sodir bo'lmaydi)

**Majburiy CI tekshiruvi ataylab yoqilmagan.** U birinchi urinishda yoqilgandi va
darhol o'zini qulflab qo'ydi: GitHub tekshiruvlarni push dan **keyin** yugurtiradi,
himoya esa tekshiruvsiz pushni rad etadi — ya'ni to'g'ridan-to'g'ri `main` ga
ishlaganda hech narsa push qilib bo'lmay qoladi. Bu mexanizm PR oqimi uchun
mo'ljallangan. Ikkinchi odam qo'shilganda PR ga o'tiladi va o'shanda yoqiladi.

Force-push kerak bo'lsa (masalan git tarixidagi DB dumpini tozalashda):

```bash
gh api -X PUT repos/Baxrom0311/soat/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'allow_force_pushes=true' -f 'enforce_admins=true' \
  -f 'required_status_checks=' -f 'required_pull_request_reviews=' -f 'restrictions='
# ... ish ...  keyin allow_force_pushes=false bilan qaytaring
```

---

## 6. Hali yopilmagan narsalar

Bular ataylab ochiq — unutilgani uchun emas.

- **`JWT_SECRET_OLD` serverda hali turibdi.** Git tarixiga sizib chiqqan eski imzolash kaliti hamon qabul qilinadi, aks holda hamma hamshira va soat bir zumda login ekraniga tushardi. Yopish: `.env` dan o'sha satrni olib tashlab, `systemctl restart nursecall-api`. Klinikalarga oldindan aytish kerak.
- **Git tarixida prod baza dumpi bor** (`2b62c93`). Repo yopiq. Tozalash `git filter-repo` talab qiladi va 95 ta commit hashini o'zgartiradi.
- **Backupning ikkala nusxasi ham bitta DigitalOcean akkauntida.** Akkaunt yopilsa, ikkalasi birga ketadi.
- **Server bitta jarayonda ishlaydi** — WebSocket ulanishlari xotirada saqlanadi, shuning uchun ikkinchi worker qo'shib bo'lmaydi.
- **ESP32 proshivkasi testsiz** va masofadan yangilanmaydi — har bir qurilmaga borish kerak.

---

## 7. Qaror qabul qilishdan oldin o'qish kerak bo'lgan joylar

Bu loyihada izohlar «nima qilinyapti» emas, «**nega shunday**» ni yozadi. Qaror o'zgartirmoqchi bo'lsangiz, avval o'sha izohni o'qing:

- `server/app/core/config.py` — har bir vaqt konstantasi va uning sababi
- `server/app/core/billing.py` — to'lov eshigi qayerda ishlaydi, qayerda ishlamaydi
- `server/app/services/call_service.py` — takror bosishlar qanday filtrlanadi
- `server/deploy/README.md` — har bir timer nega bor
- `mobile-flutter/lib/core/age.dart` — rang bosqichlari nega shu vaqtlarda
- `tokens.json` — dizayn qiymatlarining yagona manbasi; qo'lda nusxa ko'chirmang

---

*Oxirgi yangilanish: 2026-10-03.*
