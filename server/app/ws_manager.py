import json
from datetime import datetime

from fastapi import WebSocket


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

    def register(self, ws: WebSocket, clinic_id: int) -> None:
        """Register an ALREADY-accepted socket. Accept happens in the route handler so
        it can deliver custom close codes (4401/4402) on the reject paths — a close
        before accept() is downgraded to a plain HTTP 403 and the code is lost."""
        self.active.setdefault(clinic_id, []).append(ws)

    def disconnect(self, ws: WebSocket, clinic_id: int) -> None:
        conns = self.active.get(clinic_id)
        if conns and ws in conns:
            conns.remove(ws)

    async def broadcast(self, clinic_id: int, message: dict) -> None:
        conns = self.active.get(clinic_id)
        if not conns:
            return
        payload = json.dumps(message, default=_json_default)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, clinic_id)


manager = ConnectionManager()
