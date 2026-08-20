import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './components/AuthPage';
import { DashboardLayout } from './components/DashboardLayout';
import { SuperAdminLayout } from './components/SuperAdminLayout';
import { SuspendedScreen } from './components/SuspendedScreen';
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

function RequireClinicStaff({ children }: { children: ReactNode }) {
  const { token, session, suspended } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (suspended) return <SuspendedScreen />;
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
      <div className="mesh" />
      <div className="grid-overlay" />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
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
