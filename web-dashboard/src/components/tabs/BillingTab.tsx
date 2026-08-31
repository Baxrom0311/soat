import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, openClinicBill } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { ClinicSelfBilling, EffectiveStatus } from '../../api/types';
import { PrintIcon, WarningIcon } from '../Icons';

/** The vendor's contact details — online payment does not exist yet, so this IS the
 *  payment channel and must be impossible to miss on this screen. */
const CONTACT_PHONE = '+998 93 558 03 11';
const CONTACT_PHONE_TEL = '+998935580311';
const CONTACT_TELEGRAM = '@bakhromdev';
const CONTACT_TELEGRAM_URL = 'https://t.me/bakhromdev';

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  trial: 'Sinov muddati',
  active: 'Faol',
  suspended: "To'xtatilgan",
  grace: "To'lov kutilmoqda",
  overdue: "Muddat o'tgan",
};

const STATUS_NOTE: Record<EffectiveStatus, string> = {
  trial: "Sinov muddatidasiz — hozircha to'lov talab qilinmaydi.",
  active: "Obuna faol. Hammasi joyida.",
  suspended: "Obuna to'xtatilgan: sozlamalar bo'limlari yopilgan.",
  grace:
    "To'lov muddati o'tdi, lekin qo'shimcha muddat berildi — panel hozircha to'liq ishlaydi.",
  overdue: "To'lov qilinmadi: sozlamalar bo'limlari yopilgan.",
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  const label = currency === 'UZS' ? "so'm" : currency;
  return `${amount.toLocaleString('ru-RU')} ${label}`;
}

function periodLabel(months: number): string {
  if (months === 1) return 'oylik';
  if (months === 12) return 'yillik';
  return `${months} oylik`;
}

/** "12 kun qoldi" / "3 kun oshib ketdi" — the sign of days_until_expiry carries the
 *  whole meaning, so it must never be rendered as a bare number. */
function daysLabel(days: number | null): { text: string; urgent: boolean } {
  if (days === null) return { text: '—', urgent: false };
  if (days < 0) return { text: `${Math.abs(days)} kun kechikdi`, urgent: true };
  if (days === 0) return { text: 'Bugun tugaydi', urgent: true };
  return { text: `${days} kun qoldi`, urgent: days <= 7 };
}

function Fact({
  label,
  value,
  urgent,
  hint,
}: {
  label: string;
  value: string;
  urgent?: boolean;
  hint?: string;
}) {
  return (
    <div className="billing-fact">
      <span className="billing-fact__label">{label}</span>
      <span className={`billing-fact__value ${urgent ? 'billing-fact__value--urgent' : ''}`}>
        {value}
      </span>
      {hint && <span className="billing-fact__hint">{hint}</span>}
    </div>
  );
}

/**
 * The clinic's own subscription screen. Admin-only (a nurse must never see the
 * clinic's prices — DashboardLayout keeps this tab out of her nav entirely) and
 * deliberately built on the UNGATED /clinic/billing route, so it keeps working when
 * the clinic is blocked. That is precisely when it is needed.
 */
export function BillingTab() {
  const { setBlocked } = useAuth();
  const [billing, setBilling] = useState<ClinicSelfBilling | null>(null);
  const [loadError, setLoadError] = useState('');
  const [billError, setBillError] = useState('');
  const [billBusy, setBillBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await api.getClinicBilling();
      setBilling(data);
      // This route is authoritative about blocked-ness (the 402-derived flag only ever
      // learns about it as a side effect of some other request failing), so keep the
      // app-wide flag honest from here -- including clearing it after a payment lands.
      setBlocked(data.is_blocked);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Obuna ma'lumotini yuklab bo'lmadi");
    }
  }, [setBlocked]);

  useEffect(() => {
    load();
  }, [load]);

  async function showBill() {
    setBillError('');
    setBillBusy(true);
    try {
      await openClinicBill();
    } catch (err) {
      setBillError(err instanceof ApiError ? err.message : "Hisobni ochib bo'lmadi");
    } finally {
      setBillBusy(false);
    }
  }

  const contact = (
    <div className="panel-card glass">
      <h3>
        <WarningIcon /> To'lov qilish uchun biz bilan bog'laning
      </h3>
      <p className="hint">
        Onlayn to'lov hozircha mavjud emas. To'lovni rasmiylashtirish yoki obunani
        uzaytirish uchun quyidagi raqamga qo'ng'iroq qiling yoki Telegram orqali yozing —
        to'lov qabul qilinishi bilan panel darhol ochiladi.
      </p>
      <div className="contact-block">
        <a className="contact-row" href={`tel:${CONTACT_PHONE_TEL}`}>
          <span className="contact-row__label">Telefon</span>
          <span className="contact-row__value">{CONTACT_PHONE}</span>
        </a>
        <a
          className="contact-row"
          href={CONTACT_TELEGRAM_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span className="contact-row__label">Telegram</span>
          <span className="contact-row__value">{CONTACT_TELEGRAM}</span>
        </a>
      </div>
    </div>
  );

  if (loadError) {
    return (
      <section className="tab-panel">
        <div className="section-head">
          <h2>Obuna</h2>
        </div>
        <p className="form-error">
          {loadError}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
            Qayta urinish
          </button>
        </p>
        {contact}
      </section>
    );
  }

  if (!billing) {
    return (
      <section className="tab-panel">
        <div className="section-head">
          <h2>Obuna</h2>
        </div>
        <p className="hint">Yuklanmoqda…</p>
      </section>
    );
  }

  const days = daysLabel(billing.days_until_expiry);
  const hasDiscount = billing.discount_percent !== null && billing.discount_percent > 0;
  const perDevice =
    billing.effective_price !== null && billing.device_count > 0
      ? Math.round(billing.effective_price / billing.device_count)
      : null;

  return (
    <section className="tab-panel">
      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Obuna va to'lovlar</h1>
          <p className="page-header-desc">Klinika obuna holati va hisob-faktura ma'lumotlari.</p>
        </div>
        <span className={`sub-pill ${billing.effective_status}`}>
          {STATUS_LABEL[billing.effective_status]}
        </span>
      </header>

      <div className={`panel-card glass billing-hero ${billing.is_blocked ? 'billing-hero--blocked' : ''}`}>
        <p className="billing-hero__note">{STATUS_NOTE[billing.effective_status]}</p>
        <div className="billing-facts">
          <Fact label="To'langan muddat" value={fmtDate(billing.paid_until)} />
          <Fact label="Qolgan muddat" value={days.text} urgent={days.urgent} />
          <Fact
            label="Panel yopiladi"
            value={billing.is_blocked ? 'Yopilgan' : fmtDate(billing.blocked_at)}
            urgent={billing.is_blocked || billing.is_in_grace}
            hint={
              billing.is_blocked
                ? 'Chaqiruvlar paneli ishlashda davom etadi'
                : "To'lov muddatidan keyingi qo'shimcha muddat tugagach"
            }
          />
          <Fact
            label="Tarif"
            value={billing.plan_name ?? 'Tarifsiz'}
            hint={periodLabel(billing.billing_period_months) + " to'lov"}
          />
          <Fact
            label="Qurilmalar soni"
            value={String(billing.device_count)}
            hint="Har bir ESP32 qabul qilgich uchun hisoblanadi"
          />
          <Fact
            label="1 qurilma uchun"
            value={fmtMoney(perDevice, billing.currency)}
            hint={perDevice === null ? undefined : 'Umumiy summadan hisoblangan'}
          />
          <Fact
            label={`Jami (${periodLabel(billing.billing_period_months)})`}
            value={fmtMoney(billing.effective_price, billing.currency)}
            hint={
              hasDiscount && billing.list_price !== null
                ? `Chegirmasiz: ${fmtMoney(billing.list_price, billing.currency)}`
                : undefined
            }
          />
          {hasDiscount && (
            <Fact
              label="Chegirma"
              value={`−${billing.discount_percent}%`}
              hint={
                billing.discount_ends_at
                  ? `${fmtDate(billing.discount_ends_at)} gacha`
                  : 'Muddatsiz'
              }
            />
          )}
        </div>

        <div className="billing-hero__actions">
          <button className="btn btn-ghost" type="button" onClick={showBill} disabled={billBusy}>
            <PrintIcon />
            {billBusy ? '...' : "Hisobni ko'rish/chop etish"}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => load()}>
            Yangilash
          </button>
        </div>
        {billError && <p className="form-error">{billError}</p>}
      </div>

      {contact}
    </section>
  );
}
