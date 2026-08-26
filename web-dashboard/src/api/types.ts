export type StaffRole = 'admin' | 'nurse' | 'superadmin';

export type SubscriptionStatus = 'trial' | 'active' | 'suspended';

/** What the superadmin UI shows per clinic — adds the auto-computed 'overdue'. */
export type EffectiveStatus = 'trial' | 'active' | 'suspended' | 'grace' | 'overdue';

/**
 * Why a clinic is suspended. This distinction is load-bearing, not cosmetic:
 * recording a payment automatically lifts a `payment_lapse` suspension, but never
 * a `manual` one (that stays until a human un-suspends it).
 */
export type SuspensionReason = 'payment_lapse' | 'manual';

/** 1 == monthly, 12 == annual. Picks which of a plan's two per-device rates applies. */
export type BillingPeriodMonths = 1 | 12;

/**
 * Pricing is PER ESP32 receiver: price_per_device_* × device count, floored at
 * min_price_*. Monthly and annual rates are independent numbers — the annual
 * discount is a commercial decision, not a fixed ratio.
 */
export interface Plan {
  id: number;
  name: string;
  currency: string;
  price_per_device_monthly: number;
  price_per_device_annual: number;
  min_price_monthly: number;
  min_price_annual: number;
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

/** The superadmin's per-clinic billing view (attached to every clinic row). */
export interface ClinicBilling {
  plan_id: number | null;
  plan_name: string | null;
  /** Before any promotional discount. */
  list_price: number | null;
  /** What the clinic actually owes per period — discount already applied. */
  effective_price: number | null;
  custom_price_amount: number | null;
  currency: string;
  billing_period_months: number;
  device_count: number;
  paid_until: string | null;
  effective_status: EffectiveStatus;
  days_until_expiry: number | null;
  /** The instant management access actually cuts off (end of the grace window). */
  blocked_at: string | null;
  enforcement_enabled: boolean;
  suspension_reason: SuspensionReason | null;
  discount_percent: number | null;
  discount_months: number | null;
  discount_ends_at: string | null;
}

/**
 * The clinic's OWN view of its subscription (GET /api/v1/clinic/billing).
 * Admin-only and deliberately free of vendor controls (enforcement_enabled,
 * suspension_reason) — those are not facts the clinic can act on.
 */
export interface ClinicSelfBilling {
  effective_status: EffectiveStatus;
  paid_until: string | null;
  days_until_expiry: number | null;
  blocked_at: string | null;
  is_blocked: boolean;
  is_in_grace: boolean;
  billing_period_months: number;
  currency: string;
  list_price: number | null;
  effective_price: number | null;
  device_count: number;
  discount_percent: number | null;
  discount_ends_at: string | null;
  plan_name: string | null;
  needs_warning: boolean;
}

/**
 * The only billing route open to non-admins (GET /api/v1/clinic/billing-notice):
 * carries no financial data at all, just enough for a "obuna tugayapti" banner.
 */
export interface ClinicBillingNotice {
  warn: boolean;
  days_left: number | null;
  blocked: boolean;
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
  /** Raw DB column, kept for older clients: reads "active" for a clinic that is
   *  actually in grace or overdue. New code must use effective_status. */
  subscription_status: string;
  effective_status: EffectiveStatus;
  created_at: string;
}

export interface Staff {
  id: number;
  name: string;
  email: string;
  role: StaffRole;
  // Empty == unrestricted (sees/notified of every floor).
  floors: number[];
}

export interface Room {
  id: number;
  room_number: string;
  floor: number;
}

export interface Device {
  id: number;
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

/** A submission from the public landing-page contact form (superadmin-only view). */
export interface ContactRequest {
  id: number;
  name: string;
  phone: string;
  clinic_name: string | null;
  message: string | null;
  source_ip: string | null;
  handled: boolean;
  created_at: string;
}

export type WsMessage =
  | { type: 'new_call'; call: ActiveCall }
  | { type: 'ack'; call_id: number }
  | { type: 'unassigned_signal'; signal: WsUnassignedSignal }
  | { type: 'unassigned_removed'; ev1527_code: number };
