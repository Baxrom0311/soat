"""Everything the server hands out that is not the API: the landing page, the APK
downloads phones update from, and the dashboard SPA with its security headers.

Kept apart from app.main so the app factory reads as a list of what is wired in, and so
the API can be reasoned about without scrolling past file serving.
"""

from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).resolve().parents[2] / "static"
DASHBOARD_DIR = Path(__file__).resolve().parents[2] / "dashboard"

# Both directories are build or upload output, not source: `dashboard/` is produced by
# `npm run build` at deploy time and `static/` holds files that only ever existed on the
# server. Mounting one that is absent used to raise at import, which meant the whole API
# -- every patient call, every acknowledgement -- could not start on a machine where the
# dashboard had not been built yet. Importing the app must not depend on a front-end
# build; the dashboard routes below already answer 404 when the file is missing, which is
# the right failure: the API serves patients, the dashboard is a page.
router = APIRouter()


def mount_static(app: FastAPI) -> None:
    for path in (STATIC_DIR, DASHBOARD_DIR):
        path.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    # JS/CSS bundle o'z mustaqil yo'lida — qaysi SPA route orqali ochilishidan qat'i
    # nazar (/login, /app, /admin barchasi shu bitta bundle'ni yuklaydi).
    app.mount("/dashboard-static", StaticFiles(directory=DASHBOARD_DIR), name="dashboard-assets")


@router.api_route("/", methods=["GET", "HEAD"])
def landing():
    response = FileResponse(STATIC_DIR / "landing.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@router.api_route("/nurse_pic.png", methods=["GET", "HEAD"])
def serve_nurse_pic():
    return FileResponse(STATIC_DIR / "nurse_pic.png")


@router.api_route("/download/app", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/app.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/nursecall.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/nursecall-v3.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/app-v3.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/download/NurseCall.apk", methods=["GET", "HEAD"], include_in_schema=False)
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


@router.api_route("/download/watch", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/app-watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
@router.api_route("/nursecall-watch.apk", methods=["GET", "HEAD"], include_in_schema=False)
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
    router.add_api_route(_prefix, _serve_dashboard, methods=["GET"], include_in_schema=False)
    router.add_api_route(
        f"{_prefix}/{{rest:path}}", _serve_dashboard, methods=["GET"], include_in_schema=False
    )
