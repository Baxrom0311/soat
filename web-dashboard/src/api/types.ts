export type StaffRole = 'admin' | 'nurse' | 'superadmin';

export type SubscriptionStatus = 'trial' | 'active' | 'suspended';

/** What the superadmin UI shows per clinic — adds the auto-computed 'overdue'. */
export type EffectiveStatus = 'trial' | 'active' | 'suspended' | 'overdue';

export interface Plan {
  id: number;
  name: string;
  price_amount: number;
  currency: string;
  billing_period_months: number;
  max_devices: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Payment {
  id: number;
  clinic_id: number;
  amount: number;
  period_months: number;
  note: string | null;
  recorded_by: string | null;
  paid_until_after: string | null;
  paid_at: string;
}

export interface ClinicBilling {
  plan_id: number | null;
  plan_name: string | null;
  effective_price: number | null;
  custom_price_amount: number | null;
  currency: string;
  paid_until: string | null;
  effective_status: EffectiveStatus;
  max_devices: number | null;
}

export interface AuthResponse {
  access_token: string;
  role: StaffRole;
  name: string;
  clinic_id: number | null;
}

/** Persisted next to the token so role-based routing survives a page reload. */
export interface AuthSession {
  role: StaffRole;
  name: string;
  clinic_id: number | null;
}

export interface JwtPayload {
  sub: number;
  clinic_id: number | null;
  role: StaffRole;
  exp: number;
  name?: string;
  email?: string;
}

export interface Clinic {
  id: number;
  name: string;
  subscription_status: string;
  created_at: string;
}

export interface Staff {
  id: number;
  name: string;
  email: string;
  role: StaffRole;
}

export interface Room {
  id: number;
  room_number: string;
  floor: number;
}

export interface Device {
  device_id: string;
  floor: number;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
}

/** POST /api/v1/devices returns exactly these two fields — the key is shown only once. */
export interface DeviceCreateResponse {
  device_id: string;
  device_api_key: string;
}

export interface ButtonBinding {
  id: number;
  room_id: number;
  room_number: string;
  floor: number;
  ev1527_code: string;
}

export interface UnassignedSignal {
  ev1527_code: string;
  device_id: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
}

export type CallStatus = 'active' | 'acknowledged';

export interface ActiveCall {
  call_id: number;
  room_number: string;
  floor: number;
  created_at: string;
  status: CallStatus;
}

export interface HistoryCall {
  call_id: number;
  room_number: string;
  floor: number;
  status: CallStatus;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface AckResponse {
  call_id: number;
  status: CallStatus;
  acknowledged_at: string;
}

export interface AdminOverview {
  clinics: number;
  devices_total: number;
  devices_online: number;
  active_calls_total: number;
}

export interface AdminClinic {
  id: number;
  name: string;
  subscription_status: SubscriptionStatus;
  created_at: string;
  staff_count: number;
  device_count: number;
  room_count: number;
  active_calls: number;
  billing: ClinicBilling;
}

export interface AdminClinicAdmin {
  id: number;
  email: string;
  name: string;
  role: 'admin';
}

export interface AdminDevice {
  id: number;
  clinic_id: number;
  clinic_name: string;
  device_id: string;
  floor: number;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
}

export interface AdminDeviceCreateResponse {
  device_id: string;
  device_api_key: string;
}

/** A chip that has pinged POST /devices/announce but isn't bound to a Device yet. */
export interface DiscoveredDevice {
  chip_id: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ClaimDeviceInput {
  clinic_id: number;
  floor: number;
  device_id?: string;
}

/** No key in the response -- it's delivered to the ESP32 itself, not the dashboard. */
export interface ClaimDeviceResponse {
  device_id: string;
  clinic_id: number;
}

/** Wire shape of the unassigned_signal broadcast (ev1527_code arrives as an int). */
export interface WsUnassignedSignal {
  id: number;
  ev1527_code: number;
  device_id: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
}

export type WsMessage =
  | { type: 'new_call'; call: ActiveCall }
  | { type: 'ack'; call_id: number }
  | { type: 'unassigned_signal'; signal: WsUnassignedSignal }
  | { type: 'unassigned_removed'; ev1527_code: number };
