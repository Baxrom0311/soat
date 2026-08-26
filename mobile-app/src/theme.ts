// Veb-dashboard bilan bir xil rang tokenlari (server/static/style.css) — mahsulot
// bo'ylab vizual izchillik uchun.
export const darkColors = {
  background: '#060b15',
  backgroundAlt: '#0a1220',
  surface: '#141f33',
  surfaceAlt: '#101929',
  border: '#2a3c5c',
  accent: '#5b9bff',
  accentAlt: '#2fd6c4',
  danger: '#ff7466',
  // Ogohlantirish (sariq) — `danger` qizil rangi chaqiruv/xato uchun band, obuna
  // muddati tugayotgani esa shoshilinch emas, shu bilan aralashmasligi kerak.
  warning: '#f2b34b',
  success: '#2fd6c4',
  textPrimary: '#eef4fc',
  textMuted: '#a7bcd8',
  textFaint: '#6c83a2',
  textOnAccent: '#04101f',
};

export const lightColors = {
  background: '#eef3fa',
  backgroundAlt: '#e6edf7',
  surface: '#ffffff',
  surfaceAlt: '#f3f7fc',
  border: '#d5e0ee',
  accent: '#1d5fe0',
  accentAlt: '#0c8f83',
  danger: '#d9463a',
  warning: '#9a6408',
  success: '#0c8f83',
  textPrimary: '#0c1e33',
  textMuted: '#3e5872',
  textFaint: '#7488a2',
  textOnAccent: '#ffffff',
};

export type ThemeColors = typeof darkColors;

// Orqaga moslik uchun: ba'zi eski joylar hali statik `colors`ni import qilishi
// mumkin bo'lgan davrda — yangi kod useTheme() dan foydalanishi kerak.
export const colors = darkColors;
