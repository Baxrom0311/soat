STITCH DIZAYNLARI — MAHALLIY NUSXA
===================================

MUHIM: bu fayllardagi dizaynlar Stitch loyihasida SAQLANMAGAN.

Stitch'ning MCP ulanishi (claude mcp add stitch) dizayn yaratib qaytaradi,
lekin uni loyihaga yozmaydi. Tekshirilgan: edit_screens ham,
generate_screen_from_text ham loyihadagi ekranlarni o'zgartirmadi —
fayl identifikatorlari o'zgarmay qoldi.

Shuning uchun natijalar shu yerga saqlandi.

FAYLLAR
-------
chaqiruvlar.png / .html   Tuzatilgan "Faol chaqiruvlar" ekrani
qurilmalar.png / .html    Tuzatilgan "Qurilmalar monitoringi" ekrani

prompt-chaqiruvlar.txt    Shu dizaynni yaratgan so'rov matni
prompt-qurilmalar.txt     Shu dizaynni yaratgan so'rov matni

STITCH LOYIHASIGA KIRITISH UCHUN
---------------------------------
stitch.google.com ni brauzerda oching, loyihani tanlang va tegishli
prompt-*.txt faylidagi matnni nusxalab qo'ying. Brauzer orqali qilingan
o'zgarish saqlanadi.

NIMA TUZATILDI
--------------
Ikkala ekranda ham tizimda MAVJUD BO'LMAGAN ma'lumotlar olib tashlandi:

Chaqiruvlar ekranidan:
  - Bemor ismi va familiyasi
  - Bo'lim nomlari (Kardiologiya, Terapiya...)
  - Shoshilinchlik darajalari (O'TA SHOSHILINCH / SHOSHILINCH)
  - Xona sinfi (VIP Lyuks)
  Rang endi kutish vaqtini bildiradi, shoshilinchlikni emas.

Qurilmalar ekranidan:
  - Batareya foizi (EV1527 tugmasi bir tomonlama — hech narsa qaytarmaydi)
  - Signal kuchi foizi
  - Gateway kartochkasi, firmware versiyasi, OTA yangilash
  - QR skanerlash, datchik diagnostikasi
  O'rniga: qabul qilgich holati, necha kundan beri jim, va noma'lum
  tugmalarni xonaga biriktirish oqimi.

Ikkala ekran ham hozirgi backend API bilan to'liq ishlaydi —
yangi endpoint kerak emas.
