import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core import latency, log_redaction
from app.core.config import ENVIRONMENT
from app.database import SessionLocal
from app.routers import (
    admin,
    auth,
    buttons,
    calls,
    clinic,
    contact,
    devices,
    meta,
    push_tokens,
    rooms,
    staff,
    unassigned,
    web,
    ws,
)

# Re-exported: tests and deploy tooling locate the served directories through here.
from app.routers.web import DASHBOARD_DIR, STATIC_DIR  # noqa: F401

# Uvicorn only configures its own "uvicorn.*" loggers by default; without this, the
# app-level logging (e.g. app.services.push_service's Expo push delivery logs) never
# reaches the console/server.log because the root logger has no handler attached.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Must run AFTER basicConfig so the filter lands on configured loggers. Strips
# `token=`/`password=`-style values out of every log line -- see log_redaction for why
# this is enforced centrally instead of per call site.
log_redaction.install()

# Schema changes are applied by Alembic before starting the service.

API_ROUTERS = (
    auth,
    meta,
    admin,
    clinic,
    staff,
    rooms,
    devices,
    buttons,
    unassigned,
    calls,
    push_tokens,
    contact,
    ws,
)


def health():
    # Cheap enough to hit every few seconds from an uptime monitor, but still proves
    # the one dependency that actually matters (DB reachability) rather than just
    # "the process is alive", which a process supervisor already tells you for free.
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error", "db": "unreachable"})
    return {"status": "ok"}


def create_app() -> FastAPI:
    """Builds the application. Everything wired into it is listed here and nowhere else."""
    docs_enabled = ENVIRONMENT != "production"
    application = FastAPI(
        title="Nurse Call Backend (multi-tenant)",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # Times the alerting path. Added after a review found that the one number this
    # whole system exists to keep small -- button press to nurse notified -- was
    # measured nowhere, so nothing would ever notice it getting worse.
    application.middleware("http")(latency.timing_middleware)

    application.add_api_route("/health", health, methods=["GET"], include_in_schema=False)
    for module in API_ROUTERS:
        application.include_router(module.router)

    web.mount_static(application)
    application.include_router(web.router)
    return application


app = create_app()
