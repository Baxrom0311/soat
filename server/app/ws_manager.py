import asyncio
import json
from collections.abc import Awaitable, Callable
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
        self.validators: dict[WebSocket, Callable[[], Awaitable[tuple[str, list[int]] | None]]] = {}
        self.meta: dict[WebSocket, tuple[str, list[int]]] = {}
        # Which staff member each socket belongs to, and the sockets whose authority may
        # have changed since they were last checked (see mark_staff_dirty).
        self.staff_of: dict[WebSocket, int] = {}
        self.dirty: set[WebSocket] = set()
        # Broadcasts started with broadcast_soon. The event loop only keeps a weak
        # reference to a task, so one nobody holds can be garbage-collected mid-send
        # -- an event that silently never reaches the board.
        self._pending: set[asyncio.Task] = set()

    def register(
        self,
        ws: WebSocket,
        clinic_id: int,
        *,
        role: str = "",
        floors: list[int] | None = None,
        validate: Callable[[], Awaitable[tuple[str, list[int]] | None]] | None = None,
        staff_id: int | None = None,
    ) -> None:
        """Register an ALREADY-accepted socket. Accept happens in the route handler so
        it can deliver custom close codes (4401/4402) on the reject paths — a close
        before accept() is downgraded to a plain HTTP 403 and the code is lost."""
        self.active.setdefault(clinic_id, []).append(ws)
        self.meta[ws] = (role, floors or [])
        if validate is not None:
            self.validators[ws] = validate
        if staff_id is not None:
            self.staff_of[ws] = staff_id

    def mark_staff_dirty(self, staff_id: int) -> None:
        """Flags every socket of this staff member for revalidation before its next event.

        Called wherever a staff member's authority changes (floors, role, password,
        deletion). Broadcasts used to re-read the staff row for EVERY connected socket on
        EVERY event; with a connection pool of 8, one patient call fanned out to 20-30
        concurrent DB reads queued behind each other and behind the next button press.
        Now a broadcast only re-reads the sockets that were flagged here, and the
        per-socket loop in routers/ws.py still revalidates every socket at least every 30
        seconds as the backstop for changes made outside the app (psql, a second
        process). Safe to call from a threadpool thread: set.add is atomic under the GIL.
        """
        for ws, owner in list(self.staff_of.items()):
            if owner == staff_id:
                self.dirty.add(ws)

    def disconnect(self, ws: WebSocket, clinic_id: int) -> None:
        conns = self.active.get(clinic_id)
        if conns and ws in conns:
            conns.remove(ws)
        self.meta.pop(ws, None)
        self.validators.pop(ws, None)
        self.staff_of.pop(ws, None)
        self.dirty.discard(ws)
        if conns == []:
            self.active.pop(clinic_id, None)

    async def revalidate(self, ws: WebSocket, clinic_id: int) -> bool:
        self.dirty.discard(ws)
        validator = self.validators.get(ws)
        if validator is None:
            return ws in self.meta
        try:
            authority = await validator()
        except Exception:
            # A failed DB read must not leave a stream authorized indefinitely.
            authority = None
        if authority is None:
            self.disconnect(ws, clinic_id)
            await ws.close(code=4401)
            return False
        self.meta[ws] = authority
        return True

    def _should_receive(self, ws: WebSocket, floor: int | None) -> bool:
        if floor is None:
            return True
        # Sockets flagged by mark_staff_dirty are revalidated before this filter runs.
        role, floors = self.meta.get(ws, ("", []))
        if role in (StaffRole.ADMIN.value, StaffRole.SUPERADMIN.value):
            return True
        if not floors:
            return True
        return floor in floors

    def broadcast_soon(self, clinic_id: int, message: dict, *, floor: int | None = None) -> None:
        """Starts a broadcast without waiting for it, so a slow socket never holds up the
        HTTP response that caused the event. Must be called from the event loop."""
        task = asyncio.create_task(self.broadcast(clinic_id, message, floor=floor))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

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
        recipients = list(conns)
        payload = json.dumps(message, default=_json_default)

        async def _send(ws: WebSocket) -> WebSocket | None:
            try:
                if ws not in self.meta:
                    return ws  # never registered, or disconnected mid-broadcast
                if ws in self.dirty and not await self.revalidate(ws, clinic_id):
                    return ws
                if not self._should_receive(ws, floor):
                    return None
                await asyncio.wait_for(ws.send_text(payload), timeout=SEND_TIMEOUT_SECONDS)
                return None
            except Exception:
                return ws

        dead = await asyncio.gather(*(_send(ws) for ws in recipients), return_exceptions=False)
        for ws in dead:
            if ws is not None:
                self.disconnect(ws, clinic_id)


manager = ConnectionManager()
