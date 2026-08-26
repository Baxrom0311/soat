import asyncio
import json
from datetime import datetime

from fastapi import WebSocket

from app.enums import StaffRole

SEND_TIMEOUT_SECONDS = 5


def _json_default(value: object) -> str:
    # datetimes must serialize as ISO-8601 ('T' separator): str(datetime) uses a space,
    # which Safari's Date() refuses to parse.
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


class ConnectionManager:
    """Tracks connected dashboard clients grouped by clinic_id so events never leak across tenants."""

    def __init__(self) -> None:
        self.active: dict[int, list[WebSocket]] = {}
        # role/floors per connection, for floor-scoped broadcasts (see broadcast()).
        self.meta: dict[WebSocket, tuple[str, list[int]]] = {}

    def register(self, ws: WebSocket, clinic_id: int, *, role: str = "", floors: list[int] | None = None) -> None:
        """Register an ALREADY-accepted socket. Accept happens in the route handler so
        it can deliver custom close codes (4401/4402) on the reject paths — a close
        before accept() is downgraded to a plain HTTP 403 and the code is lost."""
        self.active.setdefault(clinic_id, []).append(ws)
        self.meta[ws] = (role, floors or [])

    def disconnect(self, ws: WebSocket, clinic_id: int) -> None:
        conns = self.active.get(clinic_id)
        if conns and ws in conns:
            conns.remove(ws)
        self.meta.pop(ws, None)

    def _should_receive(self, ws: WebSocket, floor: int | None) -> bool:
        if floor is None:
            return True
        # A connection missing from meta (shouldn't happen -- register() always sets
        # it) fails open to "receives everything", matching the same safe default as
        # an unassigned nurse: never silently drop a call notification.
        role, floors = self.meta.get(ws, ("", []))
        if role in (StaffRole.ADMIN.value, StaffRole.SUPERADMIN.value):
            return True
        if not floors:
            return True
        return floor in floors

    async def broadcast(self, clinic_id: int, message: dict, *, floor: int | None = None) -> None:
        """Fans out concurrently with a per-socket timeout so one stuck dashboard
        connection can never delay delivery to the others (or, for callers that
        await this directly, the HTTP response on the ingestion path).

        floor, when given, scopes delivery to connections whose registered nurse is
        unrestricted or assigned to that floor (admins always receive everything) --
        used for new_call events so a floor-restricted nurse's dashboard never shows a
        call from a floor they're not responsible for.
        """
        conns = self.active.get(clinic_id)
        if not conns:
            return
        recipients = [ws for ws in conns if self._should_receive(ws, floor)]
        if not recipients:
            return
        payload = json.dumps(message, default=_json_default)

        async def _send(ws: WebSocket) -> WebSocket | None:
            try:
                await asyncio.wait_for(ws.send_text(payload), timeout=SEND_TIMEOUT_SECONDS)
                return None
            except Exception:
                return ws

        dead = await asyncio.gather(*(_send(ws) for ws in recipients), return_exceptions=False)
        for ws in dead:
            if ws is not None:
                self.disconnect(ws, clinic_id)


manager = ConnectionManager()
