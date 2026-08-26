from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import CallStatus, StaffRole, SubscriptionStatus, SuspensionReason


class Plan(Base):
    """A named price sheet the superadmin defines once and assigns to clinics.

    Pricing is per ESP32 receiver (one per floor), charged linearly, with a floor: a
    one-device clinic still costs a site visit, an install and ongoing support, so
    pure linear pricing would be sold at a loss. Monthly and annual per-device rates
    are stored independently rather than deriving one from the other -- the annual
    discount is a commercial decision that changes per campaign, and forcing a fixed
    ratio would mean routing every exception through custom_price_amount.

    All amounts are whole currency units (so'm), never fractional.
    """

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="UZS")
    price_per_device_monthly: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_per_device_annual: Mapped[int] = mapped_column(BigInteger, nullable=False)
    min_price_monthly: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    min_price_annual: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Soft archive: an archived plan can't be newly assigned but clinics already on it keep working.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(
            SubscriptionStatus,
            name="subscription_status",
            native_enum=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
        default=SubscriptionStatus.TRIAL,
    )
    # Billing: plan assignment + optional per-clinic price override + paid-through date.
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    # NULL == charge the plan's computed price; set == this clinic's negotiated price
    # instead. A time-limited discount (below) still applies on top of either.
    custom_price_amount: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Whether this clinic is billed monthly (1) or annually (12) -- picks which of the
    # plan's two rates applies and how far a payment pushes paid_until.
    billing_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Access is auto-gated once this instant passes (unless status is trial). NULL == not
    # payment-gated yet (freshly created clinic before any billing is set up).
    paid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Time-limited promotional discount ("first 3 months at 50%"). Stored as
    # percent + duration + start rather than an end date so it matches how the deal is
    # actually spoken and sold, and so the system -- not somebody's memory -- is what
    # remembers to put the price back up when the campaign ends.
    discount_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discount_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discount_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Per-clinic kill switch for AUTOMATIC payment enforcement (overdue -> grace ->
    # blocked). Defaults on: a clinic whose enforcement was silently left off would run
    # unpaid indefinitely and the mistake would surface months later, whereas the
    # opposite mistake surfaces as an immediate phone call and takes seconds to undo.
    # Manual suspension ignores this flag -- an explicit block always blocks.
    enforcement_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_reason: Mapped[SuspensionReason | None] = mapped_column(
        SAEnum(
            SuspensionReason,
            name="suspension_reason",
            native_enum=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=True,
    )

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
    # Client-generated idempotency key (same pattern as Call.press_id): a double
    # submit -- a real double-click, or a browser retrying a POST whose response was
    # lost -- returns the ALREADY-recorded payment instead of recording a second one
    # and double-extending paid_until. NULL is allowed (unique still permits multiple
    # NULLs) for any caller that doesn't send one.
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
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
    role: Mapped[StaffRole] = mapped_column(
        SAEnum(
            StaffRole,
            name="staff_role",
            native_enum=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    floor_assignments: Mapped[list["StaffFloorAssignment"]] = relationship(
        back_populates="staff",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="StaffFloorAssignment.floor",
    )

    @property
    def floors(self) -> list[int]:
        """Empty == unrestricted: this nurse sees/gets notified of every floor's calls
        until an admin assigns at least one (the safe default -- a freshly created or
        not-yet-configured nurse must never silently stop receiving calls)."""
        return [fa.floor for fa in self.floor_assignments]


class StaffFloorAssignment(Base):
    """Which floor(s) a nurse is responsible for. A staff row with zero rows here is
    unrestricted (see Staff.floors); admin/superadmin rows are never floor-restricted
    regardless of what's stored here."""

    __tablename__ = "staff_floor_assignments"
    __table_args__ = (
        UniqueConstraint("staff_id", "floor", name="uq_staff_floor_assignments_staff_floor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    floor: Mapped[int] = mapped_column(Integer, nullable=False)

    staff: Mapped["Staff"] = relationship(back_populates="floor_assignments")


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("clinic_id", "room_number", name="uq_rooms_clinic_room_number"),)

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
    status: Mapped[CallStatus] = mapped_column(
        SAEnum(
            CallStatus,
            name="call_status",
            native_enum=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
        default=CallStatus.ACTIVE,
    )
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


class ContactRequest(Base):
    """Lead capture from the public marketing landing page. Not scoped to a clinic --
    the person filling it in is a prospective customer who has no account yet."""

    __tablename__ = "contact_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    clinic_name: Mapped[str | None] = mapped_column(String, nullable=True)
    message: Mapped[str | None] = mapped_column(String, nullable=True)
    # Kept for abuse triage only (the submitting endpoint is unauthenticated), never
    # shown to the person who submitted the form.
    source_ip: Mapped[str | None] = mapped_column(String, nullable=True)
    handled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


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
