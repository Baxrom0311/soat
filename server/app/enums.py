"""Frozen wire-contract enums.

These members are depended on, byte-for-byte, by already-deployed clients:
the web dashboard, the mobile app, and the Wear OS watch app (per the
enum-inventory audit). Existing members must NEVER be renamed or recased --
new members may only be appended. Changing an existing string value here is
a breaking change to a live production system.

Each enum subclasses ``StrEnum`` (not the legacy ``class X(str, Enum)``
mixin) so that Pydantic v2/FastAPI's ``jsonable_encoder``, plain ``str()``,
f-strings, and ``%``-formatting all agree and emit the plain lowercase
``.value`` string with no extra wrapping (the legacy str-mixin pattern
still isinstance-checks as str and encodes correctly through Pydantic, but
``str(member)`` on it yields ``"ClassName.MEMBER"`` instead of the value --
a landmine for any future log line or error-detail f-string). Code that
expects a plain ``str`` keeps working via ``isinstance(x, str)`` either way.

This module is pure Python: it must have zero imports from ``app.models``
or ``app.database`` to avoid circular imports. It is safe to import from
``models.py``, ``schemas/*``, ``services/*``, and ``repositories/*``.
"""

from enum import StrEnum


class StaffRole(StrEnum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    NURSE = "nurse"


class SubscriptionStatus(StrEnum):
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class CallStatus(StrEnum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"


class EffectiveStatus(StrEnum):
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    OVERDUE = "overdue"
