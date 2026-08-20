from fastapi import APIRouter

from app.core.config import MOBILE_APP_MIN_VERSION, WATCH_APP_MIN_VERSION

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])


@router.get("/version")
def version_info():
    """Public, unauthenticated: clients call this at startup to self-check whether
    they're old enough to need blocking (see MOBILE_APP_MIN_VERSION/WATCH_APP_MIN_VERSION)."""
    return {
        "min_mobile_version": MOBILE_APP_MIN_VERSION,
        "min_watch_version": WATCH_APP_MIN_VERSION,
    }
