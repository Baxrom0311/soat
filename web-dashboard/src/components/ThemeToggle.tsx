import { useTheme } from '../hooks/useTheme';
import { MoonIcon, SunIcon } from './Icons';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Kun/tun rejimini almashtirish"
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      <MoonIcon className="icon-moon" />
      <SunIcon className="icon-sun" />
    </button>
  );
}
