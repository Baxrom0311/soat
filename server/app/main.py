import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import admin, auth, buttons, calls, clinic, devices, meta, push_tokens, rooms, staff, unassigned, ws

# Uvicorn only configures its own "uvicorn.*" loggers by default; without this, the
# app-level logging (e.g. app.services.push_service's Expo push delivery logs) never
# reaches the console/server.log because the root logger has no handler attached.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nurse Call Backend (multi-tenant)")

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
app.include_router(ws.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# JS/CSS bundle o'z mustaqil yo'lida — qaysi SPA route orqali ochilishidan qat'i
# nazar (/login, /app, /admin barchasi shu bitta bundle'ni yuklaydi).
app.mount("/dashboard-static", StaticFiles(directory=DASHBOARD_DIR), name="dashboard-assets")


@app.get("/")
def landing():
    return FileResponse(STATIC_DIR / "landing.html")


def _serve_dashboard() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


# Uchta ALOHIDA route: /login (autentifikatsiya), /app (klinika xodimi paneli),
# /admin (superadmin paneli). Bir xil React bundle serve qilinadi, lekin
# qaysi panel ko'rsatilishini frontend'dagi react-router hal qiladi — rol
# tekshiruvi endi shartli render emas, alohida himoyalangan route sifatida.
for _prefix in ("/login", "/app", "/admin"):
    app.add_api_route(_prefix, _serve_dashboard, methods=["GET"], include_in_schema=False)
    app.add_api_route(f"{_prefix}/{{rest:path}}", _serve_dashboard, methods=["GET"], include_in_schema=False)
