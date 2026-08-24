// Production manzil doim shu — hech qachon qo'lda o'zgartirmang (build qilishda
// noto'g'ri holatda qolib, prod build lokal manzilga yoki aksincha ishlab ketishi mumkin).
//
// Lokal backend bilan sinash uchun: mobile-app/.env.local faylini yaratib (u
// .gitignore'da, hech qachon commit/build'ga tushmaydi) shuni yozing:
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:8010
// (jismoniy telefonda "127.0.0.1" o'zining telefonini anglatadi, kompyuterni emas.)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://nurcecall.boos.uz';

export const POLL_INTERVAL_MS = 10000;
