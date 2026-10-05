"""Who a live call event reaches, and who it must never reach.

This decides which screens light up when a patient presses a button. Two ways to
get it wrong, with opposite consequences:

  - too narrow, and a nurse responsible for a floor never sees a call from it --
    silent, and indistinguishable from a quiet ward;
  - too wide, and one clinic's calls appear on another clinic's board.

Coverage here was 38% before these tests, which for a component that decides
whose phone rings is the wrong number.
"""

import asyncio

import pytest

from app.enums import StaffRole
from app.ws_manager import ConnectionManager


class FakeSocket:
    """Records what it was sent. Enough of a WebSocket for the manager."""

    def __init__(self, name: str = "ws"):
        self.name = name
        self.sent: list[str] = []
        self.fail = False
        self.hang = False

    async def send_text(self, text: str) -> None:
        if self.hang:
            await asyncio.sleep(3600)
        if self.fail:
            raise RuntimeError("socket o'lgan")
        self.sent.append(text)

    def __repr__(self) -> str:
        return f"<FakeSocket {self.name}>"


def run(coro):
    return asyncio.run(coro)


# --------------------------------------------------------------- tenancy


def test_an_event_never_reaches_another_clinic():
    m = ConnectionManager()
    a, b = FakeSocket("a"), FakeSocket("b")
    m.register(a, clinic_id=1, role="nurse")
    m.register(b, clinic_id=2, role="nurse")

    run(m.broadcast(1, {"type": "new_call"}))

    assert len(a.sent) == 1
    assert b.sent == [], "boshqa klinikaning chaqiruvi yetib bordi"


def test_broadcasting_to_a_clinic_with_nobody_connected_is_harmless():
    m = ConnectionManager()
    run(m.broadcast(99, {"type": "new_call"}))  # raises if it mishandles the empty case


# ----------------------------------------------------------- floor scoping


def test_a_nurse_receives_her_own_floors():
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role="nurse", floors=[2, 3])

    run(m.broadcast(1, {"type": "new_call"}, floor=2))
    assert len(ws.sent) == 1


def test_a_nurse_does_not_receive_a_floor_she_does_not_cover():
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role="nurse", floors=[2, 3])

    run(m.broadcast(1, {"type": "new_call"}, floor=5))
    assert ws.sent == []


def test_a_nurse_with_no_floors_receives_everything():
    """Empty means unrestricted -- the server's safe default, and the opposite of
    how an empty list reads. A nurse nobody has assigned yet must receive every
    call, never none."""
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role="nurse", floors=[])

    run(m.broadcast(1, {"type": "new_call"}, floor=7))
    assert len(ws.sent) == 1


@pytest.mark.parametrize("role", [StaffRole.ADMIN.value, StaffRole.SUPERADMIN.value])
def test_an_admin_receives_every_floor_whatever_the_assignment(role):
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role=role, floors=[1])

    run(m.broadcast(1, {"type": "new_call"}, floor=9))
    assert len(ws.sent) == 1


def test_an_event_with_no_floor_reaches_everyone():
    """Acknowledgements and unassigned-signal events are clinic-wide: they have no
    room, so there is no floor to scope them to."""
    m = ConnectionManager()
    restricted = FakeSocket("restricted")
    m.register(restricted, clinic_id=1, role="nurse", floors=[1])

    run(m.broadcast(1, {"type": "ack", "call_id": 5}, floor=None))
    assert len(restricted.sent) == 1


def test_an_unregistered_socket_cannot_receive_clinic_data():
    """A revoked or incomplete registration must not inherit unrestricted access."""
    m = ConnectionManager()
    ws = FakeSocket()
    m.active[1] = [ws]
    run(m.broadcast(1, {"type": "new_call"}, floor=4))
    assert ws.sent == []


# ------------------------------------------------------------- resilience


def test_one_dead_socket_does_not_stop_the_others():
    """The failure that matters: a nurse's phone dropping off Wi-Fi must not take
    the rest of the ward's notifications with it."""
    m = ConnectionManager()
    dead, alive = FakeSocket("dead"), FakeSocket("alive")
    dead.fail = True
    m.register(dead, clinic_id=1, role="nurse")
    m.register(alive, clinic_id=1, role="nurse")

    run(m.broadcast(1, {"type": "new_call"}))
    assert len(alive.sent) == 1


def test_a_disconnected_socket_stops_receiving_and_is_forgotten():
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role="nurse")
    m.disconnect(ws, clinic_id=1)

    run(m.broadcast(1, {"type": "new_call"}))
    assert ws.sent == []
    assert ws not in m.meta, "uzilgan ulanish metama'lumotda qoldi — xotira oqadi"


def test_disconnecting_twice_is_not_an_error():
    m = ConnectionManager()
    ws = FakeSocket()
    m.register(ws, clinic_id=1, role="nurse")
    m.disconnect(ws, clinic_id=1)
    m.disconnect(ws, clinic_id=1)
