import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
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
    ws,
)

# Uvicorn only configures its own "uvicorn.*" loggers by default; without this, the
# app-level logging (e.g. app.services.push_service's Expo push delivery logs) never
# reaches the console/server.log because the root logger has no handler attached.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Must run AFTER basicConfig so the filter lands on configured loggers. Strips
# `token=`/`password=`-style values out of every log line -- see log_redaction for why
# this is enforced centrally instead of per call site.
log_redaction.install()

# Schema changes are applied by Alembic before starting the service.

_docs_enabled = ENVIRONMENT != "production"
app = FastAPI(
    title="Nurse Call Backend (multi-tenant)",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)


# Times the alerting path. Added after a review found that the one number this
# whole system exists to keep small -- button press to nurse notified -- was
# measured nowhere, so nothing would ever notice it getting worse.
app.middleware("http")(latency.timing_middleware)


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

# Both directories are build or upload output, not source: `dashboard/` is produced by
# `npm run build` at deploy time and `static/` holds files that only ever existed on the
# server. Mounting one that is absent used to raise at import, which meant the whole API
# -- every patient call, every acknowledgement -- could not start on a machine where the
# dashboard had not been built yet. Importing the app must not depend on a front-end
# build; the dashboard routes below already answer 404 when the file is missing, which is
# the right failure: the API serves patients, the dashboard is a page.
for path in (STATIC_DIR, DASHBOARD_DIR):
    path.mkdir(parents=True, exist_ok=True)

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


@app.api_route("/download/app", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/app.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/nursecall.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/nursecall-v3.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/app-v3.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/download/NurseCall.apk", methods=["GET", "HEAD"], include_in_schema=False)
def download_mobile_app():
    apk_path = STATIC_DIR / "nursecall.apk"
    if not apk_path.exists():
        return JSONResponse(status_code=404, content={"detail": "APK topilmadi"})
    response = FileResponse(
        apk_path,
        filename="NurseCall_v3.0.0.apk",
        media_type="application/vnd.android.package-archive",
    )
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["CDN-Cache-Control"] = "no-store"
    response.headers["Cloudflare-CDN-Cache-Control"] = "no-store"
    return response


@app.api_route("/download/watch", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/app-watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/nursecall-watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
def download_watch_app():
    apk_path = STATIC_DIR / "nursecall-watch.apk"
    if not apk_path.exists():
        return JSONResponse(status_code=404, content={"detail": "Watch APK topilmadi"})
    response = FileResponse(
        apk_path,
        filename="NurseCall-Watch.apk",
        media_type="application/vnd.android.package-archive",
    )
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["CDN-Cache-Control"] = "no-store"
    response.headers["Cloudflare-CDN-Cache-Control"] = "no-store"
    return response


# The dashboard keeps a 90-day bearer token in localStorage, so any script injected into
# the page could read it. This policy is what stops an injected script from running or
# from sending what it read anywhere but this origin. Inline <script> is forbidden
# (the theme bootstrap lives in theme-init.js for that reason); inline style stays
# allowed because React's style={...} props are inline styles.
DASHBOARD_CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        # 'self' covers same-origin ws/wss in current browsers; wss: keeps older Safari working.
        "connect-src 'self' wss:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ]
)


def _serve_dashboard() -> FileResponse:
    response = FileResponse(DASHBOARD_DIR / "index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Content-Security-Policy"] = DASHBOARD_CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


# Uchta ALOHIDA route: /login (autentifikatsiya), /app (klinika xodimi paneli),
# /admin (superadmin paneli). Bir xil React bundle serve qilinadi, lekin
# qaysi panel ko'rsatilishini frontend'dagi react-router hal qiladi — rol
# tekshiruvi endi shartli render emas, alohida himoyalangan route sifatida.
for _prefix in (
    "/login",
    "/app",
    "/admin",
    "/calls",
    "/wall",
    "/rooms",
    "/devices",
    "/staff",
    "/billing",
    "/overview",
    "/clinics",
    "/plans",
    "/requests",
):
    app.add_api_route(_prefix, _serve_dashboard, methods=["GET"], include_in_schema=False)
    app.add_api_route(f"{_prefix}/{{rest:path}}", _serve_dashboard, methods=["GET"], include_in_schema=False)
