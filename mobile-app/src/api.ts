import { API_BASE_URL } from './config';
import { getToken } from './auth';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Sessiya muddati tugaganda (401) ilova login ekraniga qaytishi kerak —
// App.tsx shu yerga o'z handler'ini o'rnatadi.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  // Reverse-proxy 502/504 sahifasi yoki captive-portal HTML qaytarishi mumkin —
  // JSON.parse xatosi haqiqiy statusni yashirmasligi kerak.
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (res.status === 401 && auth) {
    onUnauthorized?.();
    throw new ApiError('Sessiya muddati tugadi, qaytadan kiring', 401);
  }

  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `So'rov xato bilan tugadi (${res.status})`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), res.status);
  }

  return data as T;
}

export interface LoginResponse {
  access_token: string;
}

export interface Call {
  call_id: number;
  room_number: string;
  floor: number;
  created_at: string;
  status: string;
}

export interface AckResponse {
  call_id: number;
  status: string;
  acknowledged_at: string;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

// Joriy (hali yaroqli) tokenni yangi muddat bilan qayta chiqaradi — sessiya
// eskirishi oldini olish uchun.
export function refreshToken(): Promise<LoginResponse> {
  return request<LoginResponse>('/api/v1/auth/refresh', { method: 'POST' });
}

export interface VersionInfo {
  min_mobile_version: number;
  min_watch_version: number;
}

export function getVersionInfo(): Promise<VersionInfo> {
  return request<VersionInfo>('/api/v1/meta/version', { auth: false });
}

export function getActiveCalls(): Promise<Call[]> {
  return request<Call[]>('/api/v1/calls/active');
}

export function ackCall(callId: number, acknowledgedBy: string): Promise<AckResponse> {
  return request<AckResponse>(`/api/v1/calls/${callId}/ack`, {
    method: 'POST',
    body: { acknowledged_by: acknowledgedBy },
  });
}

export interface BillingNotice {
  warn: boolean;
  days_left: number | null;
  blocked: boolean;
}

// Obuna eslatmasi — hech qachon xato tashlamaydi (null qaytaradi): to'lov
// tekshiruvi chaqiruvlar ro'yxatini buzishi yoki to'xtatishi mumkin emas.
// 401 bo'lsa request() ichidagi handler baribir login ekraniga qaytaradi.
export async function getBillingNotice(): Promise<BillingNotice | null> {
  try {
    return await request<BillingNotice>('/api/v1/clinic/billing-notice');
  } catch {
    return null;
  }
}

export function registerPushToken(expoPushToken: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/v1/push-tokens', {
    method: 'POST',
    body: { expo_push_token: expoPushToken },
  });
}

export function unregisterPushToken(expoPushToken: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/v1/push-tokens', {
    method: 'DELETE',
    body: { expo_push_token: expoPushToken },
  });
}
