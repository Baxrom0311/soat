import { useAuth } from '../context/AuthContext';
import { LogoIcon, LogoutIcon, WarningIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

/** Full-screen notice shown when any API call returns 402 (clinic subscription suspended). */
export function SuspendedScreen() {
  const { logout } = useAuth();

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <a href="/" className="brand">
          <span className="brand-mark">
            <LogoIcon />
          </span>
          NurseCall
        </a>
        <ThemeToggle />
      </div>

      <div className="auth-wrap">
        <div className="auth-card glass suspended-card">
          <WarningIcon className="suspended-icon" />
          <h1>Obuna to'xtatilgan</h1>
          <p>
            Klinikangiz obunasi vaqtincha to'xtatilgan. Paneldan foydalanishni davom ettirish uchun
            ta'minotchi bilan bog'laning.
          </p>
          <button className="btn btn-primary btn-block" onClick={logout} type="button">
            <LogoutIcon />
            Chiqish
          </button>
        </div>
      </div>
    </div>
  );
}
