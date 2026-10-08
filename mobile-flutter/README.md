# nursecall

NurseCall — hamshira ilovasi

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Windows (hamshiralar posti kompyuteri)

Xuddi shu ilova Windows uchun ham yig‘iladi: `NurseCall-Setup-<versiya>.exe`.

- **Yuklab olish:** GitHub → Actions → "Windows desktop" → oxirgi muvaffaqiyatli
  run → Artifacts. `desktop-v<versiya>` tegi push qilinsa, o‘rnatgich shu nomdagi
  Release'ga ham qo‘shiladi.
- **Qanday ishlaydi:** Windows'da Firebase push yo‘q, shuning uchun chaqiruvlar
  serverning WebSocket'i (`/ws/calls`) va 30/5 soniyalik so‘rov orqali keladi.
  Chaqiruv kelganda ilova o‘zi telefonlardagi `nursecall_chime` ovozini to‘xtovsiz
  chaladi, xona nomi bilan Windows bildirishnomasini ko‘rsatadi va oynani oldinga
  chiqaradi. Qabul qilinganda yoki "Ovozni o‘chirish" bosilganda to‘xtaydi.
- **Oyna yopilsa** signal ham to‘xtaydi, shuning uchun yopish tugmasi avval so‘raydi
  va kichraytirishni taklif qiladi. O‘rnatgich "Windows bilan birga ishga tushirish"
  belgisini beradi; ikkinchi nusxa ochilmaydi (ikki marta chalmasligi uchun).
- **Qo‘lda yig‘ish** (Windows, Visual Studio "Desktop development with C++"):

      flutter build windows --release
      iscc /DAppVersion=3.0.3 /DSourceDir=..\..\build\windows\x64\runner\Release windows\installer\nursecall.iss
