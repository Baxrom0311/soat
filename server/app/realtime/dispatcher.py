"""Delivers other processes' events to this process's sockets, and sweeps pushes.

Runs inside the API process for its lifetime (see app.main). Before this existed a
websocket event could only come from the process holding the socket, so a background
job closing a call never reached any screen, and a second uvicorn worker would have
split the screens into two halves that each saw only their own worker's calls.

The fast path is untouched: the process that handles a button press still broadcasts
to its own sockets directly after commit. This only adds what that path cannot reach.
If the listener is down, the fast path still works for a single-process deployment,
which is what runs today.
"""

import asyncio
import logging

import psycopg
from sqlalchemy.engine import make_url
from starlette.concurrency import run_in_threadpool

from app.core.config import DATABASE_URL
from app.realtime import outbox
from app.ws_manager import manager

logger = logging.getLogger(__name__)

SWEEP_EVERY_SECONDS = 10
PRUNE_EVERY_SECONDS = 3600
RECONNECT_MAX_SECONDS = 30


def _libpq_url() -> str:
    return make_url(DATABASE_URL).set(drivername="postgresql").render_as_string(hide_password=False)


class Dispatcher:
    def __init__(self) -> None:
        self.last_id = 0
        self._tasks: list[asyncio.Task] = []
        self.connected = asyncio.Event()

    async def start(self) -> None:
        self.last_id = await run_in_threadpool(outbox.latest_id)
        self._tasks = [
            asyncio.create_task(self._listen_forever()),
            asyncio.create_task(self._sweep_forever()),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

    async def _deliver(self, event) -> None:
        self.last_id = max(self.last_id, event.id)
        if event.origin == outbox.origin():
            return  # already broadcast on the fast path
        await manager.broadcast(event.clinic_id, event.message, floor=event.floor)

    async def _listen_forever(self) -> None:
        delay = 1
        while True:
            try:
                # TCP keepalives: a listener whose server vanished without a reset would
                # otherwise wait on notifies() forever and never reconnect.
                async with await psycopg.AsyncConnection.connect(
                    _libpq_url(),
                    autocommit=True,
                    keepalives=1,
                    keepalives_idle=30,
                    keepalives_interval=10,
                    keepalives_count=3,
                ) as conn:
                    await conn.execute(f"LISTEN {outbox.CHANNEL}")
                    self.connected.set()
                    delay = 1
                    # Anything committed while we were not listening.
                    for event in await run_in_threadpool(outbox.foreign_since, self.last_id):
                        await self._deliver(event)
                    async for note in conn.notifies():
                        event = await run_in_threadpool(outbox.get, int(note.payload))
                        if event is not None:
                            await self._deliver(event)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Event listener lost its connection; retrying in %ss", delay)
            self.connected.clear()
            await asyncio.sleep(delay)
            delay = min(delay * 2, RECONNECT_MAX_SECONDS)

    async def _sweep_forever(self) -> None:
        since_prune = 0.0
        while True:
            await asyncio.sleep(SWEEP_EVERY_SECONDS)
            try:
                sent = await run_in_threadpool(outbox.sweep_pushes)
                if sent:
                    logger.info("Sweeper sent %d pending push(es)", sent)
                since_prune += SWEEP_EVERY_SECONDS
                if since_prune >= PRUNE_EVERY_SECONDS:
                    since_prune = 0
                    await run_in_threadpool(outbox.prune)
            except Exception:
                logger.exception("Push sweep failed")


dispatcher = Dispatcher()
