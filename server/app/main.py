import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core import log_redaction
from app.core.config import ENVIRONMENT
from app.database import Base, SessionLocal, engine
from app.routers import admin, auth, buttons, calls, clinic, contact, devices, meta, push_tokens, rooms, staff, unassigned, ws

# Uvicorn only configures its own "uvicorn.*" loggers by default; without this, the
# app-level logging (e.g. app.services.push_service's Expo push delivery logs) never
# reaches the console/server.log because the root logger has no handler attached.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Must run AFTER basicConfig so the filter lands on configured loggers. Strips
# `token=`/`password=`-style values out of every log line -- see log_redaction for why
# this is enforced centrally instead of per call site.
log_redaction.install()

# Idempotent (checkfirst) for tables and, on Postgres, for the native ENUM types
# registered on Base.metadata too -- harmlessly no-ops against types/tables an
# Alembic migration already created with matching names. app.models is imported
# transitively above (app.routers -> app.services -> app.models), so all
# enum-typed columns (subscription_status, staff_role, call_status) are already
# registered on Base.metadata by the time this call runs. Operationally, still
# run the Alembic migration before deploying this code: migrate-then-deploy is
# the safer default even though either order is safe here.
Base.metadata.create_all(bind=engine)

_docs_enabled = ENVIRONMENT != "production"
app = FastAPI(
    title="Nurse Call Backend (multi-tenant)",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)


@app.get("/health", include_in_schema=False)
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


app.include_router(auth.router)
app.include_router(meta.router)
app.include_router(admin.router)
app.include_router(clinic.router)
app.include_router(staff.router)
app.include_router(rooms.router)
app.include_router(devices.router)
app.include_router(buttons.router)
app.include_router(unassigned.router)
app.include_router(calls.router)
app.include_router(push_tokens.router)
app.include_router(contact.router)
app.include_router(ws.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# JS/CSS bundle o'z mustaqil yo'lida — qaysi SPA route orqali ochilishidan qat'i
# nazar (/login, /app, /admin barchasi shu bitta bundle'ni yuklaydi).
app.mount("/dashboard-static", StaticFiles(directory=DASHBOARD_DIR), name="dashboard-assets")


@app.api_route("/", methods=["GET", "HEAD"])
def landing():
    response = FileResponse(STATIC_DIR / "landing.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.api_route("/nurse_pic.png", methods=["GET", "HEAD"])
def serve_nurse_pic():
    return FileResponse(STATIC_DIR / "nurse_pic.png")


def _serve_dashboard() -> FileResponse:
    response = FileResponse(DASHBOARD_DIR / "index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# Uchta ALOHIDA route: /login (autentifikatsiya), /app (klinika xodimi paneli),
# /admin (superadmin paneli). Bir xil React bundle serve qilinadi, lekin
# qaysi panel ko'rsatilishini frontend'dagi react-router hal qiladi — rol
# tekshiruvi endi shartli render emas, alohida himoyalangan route sifatida.
for _prefix in ("/login", "/app", "/admin", "/calls", "/wall", "/rooms", "/devices", "/staff", "/billing", "/overview", "/clinics", "/plans", "/requests"):
    app.add_api_route(_prefix, _serve_dashboard, methods=["GET"], include_in_schema=False)
    app.add_api_route(f"{_prefix}/{{rest:path}}", _serve_dashboard, methods=["GET"], include_in_schema=False)
