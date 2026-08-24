from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Plan(Base):
    """A subscription tariff the superadmin defines once and assigns to clinics.
    Editing the price here re-prices every clinic on the plan that has no override."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    price_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # whole currency units (so'm)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="UZS")
    billing_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # NULL == unlimited devices on this plan.
    max_devices: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Soft archive: an archived plan can't be newly assigned but clinics already on it keep working.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    subscription_status: Mapped[str] = mapped_column(String, nullable=False, default="trial")
    # Billing: plan assignment + optional per-clinic price override + paid-through date.
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    # NULL == charge the plan's price; set == this clinic's negotiated price instead.
    custom_price_amount: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Access is auto-gated once this instant passes (unless status is trial). NULL == not
    # payment-gated yet (freshly created clinic before any billing is set up).
    paid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Payment(Base):
    """Audit log of a payment recorded by the superadmin. Recording one pushes the
    clinic's paid_until forward by period_months."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    recorded_by: Mapped[str | None] = mapped_column(String, nullable=True)  # superadmin name/email
    paid_until_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # NULL clinic_id == platform-level account (superadmin); every clinic staff row has one.
    clinic_id: Mapped[int | None] = mapped_column(ForeignKey("clinics.id"), nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # "superadmin" | "admin" | "nurse"
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    room_number: Mapped[str] = mapped_column(String, nullable=False)
    floor: Mapped[int] = mapped_column(Integer, nullable=False)

    buttons: Mapped[list["Button"]] = relationship(back_populates="room")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    device_api_key_hash: Mapped[str] = mapped_column(String, nullable=False)
    floor: Mapped[int] = mapped_column(Integer, nullable=False)
    # Hardware chip id of the ESP32 this row was zero-touch-claimed from (see
    # /api/v1/devices/announce). NULL for devices registered the old manual way.
    chip_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    # bcrypt (device_api_key_hash above) is one-way, so the zero-touch flow needs the
    # plaintext kept somewhere to hand back to the ESP32 over /announce. Only ever set
    # for chip_id-claimed devices, and scrubbed once the delivery window closes.
    pending_key_plaintext: Mapped[str | None] = mapped_column(String, nullable=True)
    # Last time the plaintext key above was handed to the ESP32 over /announce, kept
    # for observability only. The delivery window itself is a fixed deadline measured
    # from created_at (claim time) -- see discovered_device_service.announce -- so this
    # does NOT gate anything; it must not be used to decide whether the window is open.
    key_delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DiscoveredDevice(Base):
    """Zero-touch discovery ledger: every chip_id that has ever hit the unauthenticated
    /api/v1/devices/announce endpoint, whether or not it has been claimed into a Device
    yet. Superadmin's "online, unclaimed" list is this table filtered on claimed_device_id
    IS NULL + a recent last_seen_at."""

    __tablename__ = "discovered_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chip_id: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_ip: Mapped[str | None] = mapped_column(String, nullable=True)
    claimed_device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"), nullable=True)


class Button(Base):
    __tablename__ = "buttons"
    __table_args__ = (UniqueConstraint("clinic_id", "ev1527_code", name="uq_buttons_clinic_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    ev1527_code: Mapped[int] = mapped_column(BigInteger, nullable=False)

    room: Mapped["Room"] = relationship(back_populates="buttons")


class UnassignedSignal(Base):
    __tablename__ = "unassigned_signals"
    __table_args__ = (
        UniqueConstraint("clinic_id", "ev1527_code", name="uq_unassigned_clinic_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False)
    ev1527_code: Mapped[int] = mapped_column(BigInteger, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    seen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class PushToken(Base):
    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), nullable=False, index=True)
    expo_push_token: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Call(Base):
    __tablename__ = "calls"
    __table_args__ = (
        # Backs the ingestion hot-path (get_active_by_room), the active-calls list, and
        # call_history's ORDER BY created_at DESC all at once -- the highest-frequency
        # query pattern in the app, so it must never fall back to a full table scan.
        Index("ix_calls_clinic_status_created", "clinic_id", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    # Client-generated idempotency key: the ESP32 retry queue re-sends a press whose
    # response was lost; matching press_id returns the original call instead of a
    # phantom duplicate (unique allows multiple NULLs for clients that don't send it).
    press_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String, nullable=True)

    room: Mapped["Room"] = relationship()


class AuditLog(Base):
    """Append-only record of every superadmin/admin write action. Actor identity is
    snapshotted (name/email/role) in addition to the FK so the log stays readable even
    if the acting staff account is later deleted."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_actor_created", "actor_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String, nullable=False)
    actor_email: Mapped[str] = mapped_column(String, nullable=False)
    actor_role: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)  # e.g. "clinic.suspended"
    target_type: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "clinic"
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
