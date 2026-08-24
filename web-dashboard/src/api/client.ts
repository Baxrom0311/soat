import type {
  AckResponse,
  ActiveCall,
  AdminClinic,
  AdminClinicAdmin,
  AdminDevice,
  AdminDeviceCreateResponse,
  AdminOverview,
  AuthResponse,
  AuthSession,
  ButtonBinding,
  ClaimDeviceInput,
  ClaimDeviceResponse,
  Clinic,
  Device,
  DeviceCreateResponse,
  DiscoveredDevice,
  HistoryCall,
  Payment,
  Plan,
  Room,
  Staff,
  SubscriptionStatus,
  UnassignedSignal,
} from './types';

const TOKEN_KEY = 'nc_token';
const SESSION_KEY = 'nc_session';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    // A session written by an older deploy (or truncated) may parse but miss fields;
    // trusting it would route the user into the wrong layout with an undefined role.
    if (typeof parsed.role !== 'string' || typeof parsed.name !== 'string') return null;
    return parsed as AuthSession;
  } catch {
    return null;
  }
}
export function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Thrown/handled centrally: callers that need 401 to trigger logout listen via `onUnauthorized`. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}
/** For non-request auth failures (e.g. the WebSocket handshake being rejected with 4401). */
export function triggerUnauthorized(): void {
  clearToken();
  clearSession();
  onUnauthorized?.();
}

/** 402 == clinic subscription suspended: flips the whole app into the suspended screen. */
let onSuspended: (() => void) | null = null;
export function setSuspendedHandler(fn: (() => void) | null) {
  onSuspended = fn;
}
/** For the WebSocket handshake being rejected with 4402 (billing-blocked), mirroring REST 402. */
export function triggerSuspended(): void {
  onSuspended?.();
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(path, { ...opts, headers });

  // A 401 from login means wrong credentials, not an expired session — it must show
  // the server's message instead of silently wiping the (nonexistent) session.
  const isLogin = path.startsWith('/api/v1/auth/login');

  if (resp.status === 401 && !isLogin) {
    clearToken();
    clearSession();
    onUnauthorized?.();
    throw new ApiError(401, 'Unauthorized');
  }

  if (resp.status === 402) {
    onSuspended?.();
    throw new ApiError(402, 'subscription_suspended');
  }

  const isJson = resp.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await resp.json().catch(() => null) : null;

  if (!resp.ok) {
    const message = (data && (data.detail as string)) || `Xato (${resp.status})`;
    throw new ApiError(resp.status, message);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getClinic: () => request<Clinic>('/api/v1/clinic/me'),

  getStaff: () => request<Staff[]>('/api/v1/staff'),
  createStaff: (input: { email: string; password: string; role: string; name: string }) =>
    request<Staff>('/api/v1/staff', { method: 'POST', body: JSON.stringify(input) }),
  updateStaff: (
    staffId: number,
    input: Partial<{ name: string; email: string; role: string; password: string }>
  ) => request<Staff>(`/api/v1/staff/${staffId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteStaff: (staffId: number) => request<void>(`/api/v1/staff/${staffId}`, { method: 'DELETE' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  getRooms: () => request<Room[]>('/api/v1/rooms'),
  createRoom: (input: { room_number: string; floor: number }) =>
    request<Room>('/api/v1/rooms', { method: 'POST', body: JSON.stringify(input) }),

  getDevices: () => request<Device[]>('/api/v1/devices'),
  createDevice: (input: { device_id: string; floor: number }) =>
    request<DeviceCreateResponse>('/api/v1/devices', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getButtons: () => request<ButtonBinding[]>('/api/v1/buttons'),
  createButton: (input: { ev1527_code: string; room_id: number }) =>
    request<ButtonBinding>('/api/v1/buttons', { method: 'POST', body: JSON.stringify(input) }),
  deleteButton: (id: number) => request<void>(`/api/v1/buttons/${id}`, { method: 'DELETE' }),

  getUnassignedSignals: () => request<UnassignedSignal[]>('/api/v1/unassigned-signals'),

  getActiveCalls: () => request<ActiveCall[]>('/api/v1/calls/active'),
  getCallHistory: (limit = 50) => request<HistoryCall[]>(`/api/v1/calls/history?limit=${limit}`),
  ackCall: (callId: number, acknowledged_by?: string) =>
    request<AckResponse>(`/api/v1/calls/${callId}/ack`, {
      method: 'POST',
      body: JSON.stringify(acknowledged_by ? { acknowledged_by } : {}),
    }),

  getAdminOverview: () => request<AdminOverview>('/api/v1/admin/overview'),
  getAdminClinics: () => request<AdminClinic[]>('/api/v1/admin/clinics'),
  createAdminClinic: (input: { name: string }) =>
    request<AdminClinic>('/api/v1/admin/clinics', { method: 'POST', body: JSON.stringify(input) }),
  updateAdminClinic: (
    clinicId: number,
    input: {
      name?: string;
      subscription_status?: SubscriptionStatus;
      plan_id?: number;
      clear_plan?: boolean;
      custom_price_amount?: number;
      clear_custom_price?: boolean;
    }
  ) =>
    request<AdminClinic>(`/api/v1/admin/clinics/${clinicId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  // ---- Plans (tariff rejalari) ----
  getPlans: () => request<Plan[]>('/api/v1/admin/plans'),
  createPlan: (input: {
    name: string;
    price_amount: number;
    currency?: string;
    billing_period_months?: number;
    max_devices?: number | null;
  }) => request<Plan>('/api/v1/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (
    planId: number,
    input: Partial<{
      name: string;
      price_amount: number;
      currency: string;
      billing_period_months: number;
      max_devices: number | null;
      is_active: boolean;
    }>
  ) => request<Plan>(`/api/v1/admin/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePlan: (planId: number) => request<void>(`/api/v1/admin/plans/${planId}`, { method: 'DELETE' }),

  // ---- Payments (to'lovlar) ----
  getClinicPayments: (clinicId: number) =>
    request<Payment[]>(`/api/v1/admin/clinics/${clinicId}/payments`),
  recordPayment: (clinicId: number, input: { amount: number; period_months: number; note?: string }) =>
    request<Payment>(`/api/v1/admin/clinics/${clinicId}/payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createClinicAdmin: (clinicId: number, input: { email: string; password: string; name: string }) =>
    request<AdminClinicAdmin>(`/api/v1/admin/clinics/${clinicId}/admins`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getClinicStaff: (clinicId: number) => request<Staff[]>(`/api/v1/admin/clinics/${clinicId}/staff`),
  resetStaffPassword: (clinicId: number, staffId: number) =>
    request<{ new_password: string }>(
      `/api/v1/admin/clinics/${clinicId}/staff/${staffId}/reset-password`,
      { method: 'POST' }
    ),
  getAdminDevices: (clinicId?: number) =>
    request<AdminDevice[]>(
      clinicId ? `/api/v1/admin/devices?clinic_id=${clinicId}` : '/api/v1/admin/devices'
    ),
  createAdminDevice: (input: { clinic_id: number; device_id: string; floor: number }) =>
    request<AdminDeviceCreateResponse>('/api/v1/admin/devices', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getDiscoveredDevices: () => request<DiscoveredDevice[]>('/api/v1/admin/discovered-devices'),
  claimDiscoveredDevice: (chipId: string, input: ClaimDeviceInput) =>
    request<ClaimDeviceResponse>(`/api/v1/admin/discovered-devices/${chipId}/claim`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function wsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/calls?token=${encodeURIComponent(token)}`;
}
