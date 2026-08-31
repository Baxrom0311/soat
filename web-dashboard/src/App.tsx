import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './components/AuthPage';
import { DashboardLayout } from './components/DashboardLayout';
import { SuperAdminLayout } from './components/SuperAdminLayout';
import { WallView } from './routes/WallView';
import { AuthProvider, useAuth } from './context/AuthContext';

// /login — faqat autentifikatsiya. Allaqachon kirgan bo'lsa, rolga qarab
// tegishli panelga yo'naltiradi (superadmin va klinika xodimi endi butunlay
// alohida route/komponent, bitta ekran ichida shartli render qilinmaydi).
function LoginRoute() {
  const { token, session } = useAuth();
  if (token) {
    return <Navigate to={session?.role === 'superadmin' ? '/admin' : '/app'} replace />;
  }
  return <AuthPage />;
}

// A billing-blocked clinic is deliberately NOT bounced out of the dashboard here.
// The backend only gates clinic MANAGEMENT with 402 -- live calls, acknowledgment, the
// WS stream and the clinic's own billing screens all stay open on purpose, so replacing
// the whole app with a suspended screen would (a) hide the active-call board that must
// never go dark over an invoice and (b) hide the one screen that explains how to pay.
// Blocked-ness is surfaced inside DashboardLayout instead: a persistent banner, plus a
// per-tab notice on just the tabs the server actually withholds.
function RequireClinicStaff({ children }: { children: ReactNode }) {
  const { token, session } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (session?.role === 'superadmin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { token, session } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (session?.role !== 'superadmin') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/wall"
            element={
              <RequireClinicStaff>
                <WallView />
              </RequireClinicStaff>
            }
          />
          <Route
            path="/app/*"
            element={
              <RequireClinicStaff>
                <DashboardLayout />
              </RequireClinicStaff>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RequireSuperAdmin>
                <SuperAdminLayout />
              </RequireSuperAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
