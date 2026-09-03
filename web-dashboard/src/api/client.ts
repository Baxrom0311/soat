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
  BillingPeriodMonths,
  ButtonBinding,
  ClaimDeviceInput,
  ClaimDeviceResponse,
  Clinic,
  ClinicBillingNotice,
  ClinicSelfBilling,
  ContactRequest,
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

/**
 * 402 == this clinic is billing-blocked.
 *
 * The backend only ever returns 402 from clinic MANAGEMENT routes: the alerting path
 * (active calls, ack, the WS stream) and the clinic's own billing screens are
 * deliberately ungated, so an unpaid invoice can never turn into a patient pressing a
 * button and nobody coming. A 402 therefore means "these particular screens are
 * withheld", NOT "the app is over" — this handler only records the blocked FLAG so the
 * UI can show a banner and withhold the management tabs. It must never take the whole
 * app over, and the ApiError is still thrown so the calling tab can render its own
 * inline notice.
 */
let onBlocked: ((blocked: boolean) => void) | null = null;
export function setBlockedHandler(fn: ((blocked: boolean) => void) | null) {
  onBlocked = fn;
}
/** For non-request signals of the same fact (e.g. a WebSocket closed with 4402). */
export function triggerBlocked(blocked = true): void {
  onBlocked?.(blocked);
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
    onBlocked?.(true);
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

  // ---- Clinic-facing billing (works while the clinic is BLOCKED) ----
  /** Clinic ADMIN only — carries the clinic's prices. */
  getClinicBilling: () => request<ClinicSelfBilling>('/api/v1/clinic/billing'),
  /** Any clinic member, nurses included: no financial data, just the warn/blocked flags. */
  getClinicBillingNotice: () => request<ClinicBillingNotice>('/api/v1/clinic/billing-notice'),

  getStaff: () => request<Staff[]>('/api/v1/staff'),
  createStaff: (input: { email: string; password: string; role: string; name: string; floors: number[] }) =>
    request<Staff>('/api/v1/staff', { method: 'POST', body: JSON.stringify(input) }),
  updateStaff: (
    staffId: number,
    input: Partial<{ name: string; email: string; role: string; password: string; floors: number[] }>
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
  updateRoom: (roomId: number, input: Partial<{ room_number: string; floor: number }>) =>
    request<Room>(`/api/v1/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) }),

  getDevices: () => request<Device[]>('/api/v1/devices'),
  createDevice: (input: { device_id: string; floor: number }) =>
    request<DeviceCreateResponse>('/api/v1/devices', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateDevice: (devicePk: number, input: { floor: number }) =>
    request<Device>(`/api/v1/devices/${devicePk}`, { method: 'PATCH', body: JSON.stringify(input) }),

  getButtons: () => request<ButtonBinding[]>('/api/v1/buttons'),
  createButton: (input: { ev1527_code: string; room_id: number }) =>
    request<ButtonBinding>('/api/v1/buttons', { method: 'POST', body: JSON.stringify(input) }),
  updateButton: (id: number, input: { room_id: number }) =>
    request<ButtonBinding>(`/api/v1/buttons/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteButton: (id: number) => request<void>(`/api/v1/buttons/${id}`, { method: 'DELETE' }),

  getUnassignedSignals: () => request<UnassignedSignal[]>('/api/v1/unassigned-signals'),
  deleteUnassignedSignal: (id: number) => request<void>(`/api/v1/unassigned-signals/${id}`, { method: 'DELETE' }),
  clearAllUnassignedSignals: () => request<void>('/api/v1/unassigned-signals', { method: 'DELETE' }),

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
      billing_period_months?: BillingPeriodMonths;
      // A discount is one deal, not three fields: percent + months go together, and
      // clear_discount removes the whole thing.
      discount_percent?: number;
      discount_months?: number;
      clear_discount?: boolean;
      enforcement_enabled?: boolean;
    }
  ) =>
    request<AdminClinic>(`/api/v1/admin/clinics/${clinicId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  /** Ends a trial: trial → active, and stamps paid_until. 409 if not on trial. */
  startBilling: (clinicId: number) =>
    request<AdminClinic>(`/api/v1/admin/clinics/${clinicId}/start-billing`, { method: 'POST' }),

  // ---- Plans (tariff rejalari) ----
  getPlans: () => request<Plan[]>('/api/v1/admin/plans'),
  createPlan: (input: {
    name: string;
    currency?: string;
    price_per_device_monthly: number;
    price_per_device_annual: number;
    min_price_monthly?: number;
    min_price_annual?: number;
  }) => request<Plan>('/api/v1/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (
    planId: number,
    input: Partial<{
      name: string;
      currency: string;
      price_per_device_monthly: number;
      price_per_device_annual: number;
      min_price_monthly: number;
      min_price_annual: number;
      is_active: boolean;
    }>
  ) => request<Plan>(`/api/v1/admin/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePlan: (planId: number) => request<void>(`/api/v1/admin/plans/${planId}`, { method: 'DELETE' }),

  // ---- Payments (to'lovlar) ----
  getClinicPayments: (clinicId: number) =>
    request<Payment[]>(`/api/v1/admin/clinics/${clinicId}/payments`),
  recordPayment: (
    clinicId: number,
    input: {
      amount: number;
      /** Omitted == use the clinic's own configured billing period. */
      period_months?: number;
      note?: string;
      idempotency_key?: string;
      /** Only set after the operator has been shown the 422 and affirmed the figure. */
      allow_amount_mismatch?: boolean;
    }
  ) =>
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
  updateAdminDevice: (devicePk: number, input: { floor: number }) =>
    request<AdminDevice>(`/api/v1/admin/devices/${devicePk}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  // ---- Contact requests (landing sahifadagi so'rovlar) ----
  getContactRequests: () => request<ContactRequest[]>('/api/v1/contact-requests?limit=100'),
  markContactRequestHandled: (id: number) =>
    request<ContactRequest>(`/api/v1/contact-requests/${id}/handled`, { method: 'POST' }),

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

/**
 * Opens the printable bill (GET /api/v1/clinic/bill) in a new window.
 *
 * The route is bearer-authenticated and returns raw HTML, so a plain `<a href>` would
 * arrive without the Authorization header and 401. Instead we fetch it ourselves, wrap
 * the HTML in a Blob and hand the browser a blob: URL — which the new window can render
 * (and the user can print or save) with no further request to the API.
 */
export async function openClinicBill(): Promise<void> {
  const token = getToken();
  const resp = await fetch('/api/v1/clinic/bill', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) {
    throw new ApiError(resp.status, `Hisobni olib bo'lmadi (${resp.status})`);
  }
  const html = await resp.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new ApiError(0, "Brauzer yangi oynani bloklab qo'ydi — pop-up'ga ruxsat bering.");
  }
  // Revoking immediately can race the new window's own load in some browsers; give it
  // a moment, then release so a long session doesn't accumulate blob URLs.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The socket URL carries NO credential. The token goes in the subprotocol instead
 *  (see wsProtocols): a query string is written verbatim into uvicorn's and nginx's
 *  access logs, which had left months of live session tokens sitting in plaintext. */
export function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/calls`;
}

/** Passed as the WebSocket subprotocol list; the server reads element 1 as the JWT and
 *  echoes "bearer" back. Subprotocol values are not logged by either proxy layer. */
export function wsProtocols(token: string): string[] {
  return ['bearer', token];
}
