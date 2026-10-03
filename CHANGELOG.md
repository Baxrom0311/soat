# O'zgarishlar tarixi

Klinikaga nima o'zgarganini aytish uchun. Git tarixi batafsilroq, lekin uni o'qib
chiqmasdan «yangi versiyada nima bor» degan savolga javob berib bo'lmasdi.

**Versiya raqamlari nimani anglatadi.** `KATTA.O'RTA.KICHIK` — `KATTA` klinika
ishlash tartibini o'zgartiradigan narsa (bunday hali bo'lmagan), `O'RTA` yangi
imkoniyat, `KICHIK` tuzatish. Android uchun undan tashqari `+N` — bu `versionCode`,
u **hech qachon kamaymaydi** va har bir chiqarilgan buildda oshadi, aks holda
telefon yangilanishni rad etadi.

Server alohida versiyalanmaydi: u har doim `main` dagi oxirgi holat, va
`deploy.sh` qaysi commit chiqarilganini `/root/nursecall_releases/deployed.log`
ga yozadi.

---

## Telefon ilovasi

### 2.9.0 — 2026-10-03
- **Bildirishnoma ikonkasi tuzatildi.** Status panelida oq to'rtburchak chiqardi.
  Android u yerda faqat shaklni oladi, rangni emas — ilova esa to'liq bo'yalgan
  rasm berardi. Firebase yuborgan bildirishnomalar uchun esa ikonka umuman
  sozlanmagan edi.
- Yangi ikonka: ilova ro'yxatida ham, bildirishnomada ham.

### 2.8.0 — 2026-10-03
- Yangi ilova ikonkasi (NurseCall belgisi). Ilgari Flutterning standart logotipi turardi.

### 2.7.0 — 2026-10-02
- **Soat bilan ulanish qaytarildi.** Telefonga kirsangiz, hisob Bluetooth orqali
  palata soatiga o'zi uzatiladi — soatda email va parol terish shart emas.
  Chiqsangiz, soat ham chiqadi: aks holda uyiga ketgan hamshiraning hisobi soatda
  qolib, chaqiruvlar uning nomi bilan qabul qilinaverardi.
- Profilda yangi **Palata soati** bo'limi: qaysi soat ulangan, hisob yuborilganmi.

### 2.6.0 — 2026-10-02
- **Klinika sozlamalari** (faqat admin uchun): qabul qilgichlar holati, tugmalarni
  xonaga biriktirish, xonalar, hamshiralar va ularning qavatlari.
  Tugma biriktirish endi xonada turib bajariladi — ilgari noutbukda qilinardi.

### 2.5.0 — 2026-10-02
- **Chaqiruv endi darhol keladi** — har 5 soniyada so'rash o'rniga jonli ulanish.
  Ulanish uzilsa, eski usulga avtomatik qaytadi.
- **Chaqiruvlar tarixi**: kim javob bergan, qancha kutilgan, va javobsiz qolganlari.
- **Parolni o'zgartirish** ilovaning o'zidan.
- Sessiya o'zi yangilanadi — smena o'rtasida tizimdan chiqib qolmaslik uchun.

### 2.4.0 — 2026-10-01
- Profilda **bildirishnoma va mavzu sozlamalari**. Telefonni jim qilish uchun
  endi ilovani o'chirish shart emas.
- Android chaqiruvni jimlatib qo'ygan bo'lsa, ilova buni aytadi va tuzatish
  tugmasini beradi.
- Kunduzgi va tungi mavzu.

---

## Palata soati

### 1.6.0 — 2026-10-03
- Yangi ikonka.

### 1.5.0 — 2026-10-03
- **Chaqiruvni kim qabul qilgani endi to'g'ri yoziladi.** Ilgari soatdan kelgan
  har bir qabul `"Palata soati"` deb yozilardi — bitta klinikaning 283 ta
  qabulining 283 tasi shu nom bilan, birortasi ham odam nomi emas. Endi tarixda
  hamshiraning ismi turadi.
- Soat ekranida kim kirgani ko'rinadi.

---

## Serverda (klinikaga ko'rinadigan o'zgarishlar)

### 2026-10-03
- Chaqiruvning rang bosqichlari hamma ekranda bir xil bo'ldi. Ilgari telefon va
  palata soati bitta chaqiruvni har xil shoshilinchlikda ko'rsatardi.

### 2026-10-01
- **Javobsiz qolgan chaqiruvlar 12 soatdan keyin o'zi yopiladi.** Ilgari ular
  abadiy «faol» bo'lib turardi — 28 tasi ochiq edi, eng eskisi olti kunlik.
  Tarixda ular «javobsiz qoldi» deb ko'rsatiladi, «qabul qilindi» deb emas.
- Javob berilmagan chaqiruv haqida qayta ogohlantirish.
- Jim qolgan qabul qilgich haqida avtomatik xabar.
