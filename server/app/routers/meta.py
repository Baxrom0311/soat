from fastapi import APIRouter, Depends

from app.core import latency
from app.core.config import MOBILE_APP_MIN_VERSION, WATCH_APP_MIN_VERSION
from app.core.deps import CurrentUser, require_superadmin

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])


@router.get("/version")
def version_info():
    """Public, unauthenticated: clients call this at startup to self-check whether
    they're old enough to need blocking (see MOBILE_APP_MIN_VERSION/WATCH_APP_MIN_VERSION)."""
    return {
        "min_mobile_version": MOBILE_APP_MIN_VERSION,
        "min_watch_version": WATCH_APP_MIN_VERSION,
    }


@router.get("/latency")
def latency_snapshot(user: CurrentUser = Depends(require_superadmin)):
    """Recent response times for the alerting path, in milliseconds.

    Superadmin only: it describes the platform, not a clinic, and a clinic has
    nothing to do with it.

    p95 rather than a mean. A mean hides the slow tail entirely, and the slow
    tail is the whole question -- the same lesson the answer-time statistics
    learned when one clinic's mean read 435 minutes against a median of two.

    In-memory and per-process, so it resets on restart and reflects this
    process only. That is deliberate: the alternative is writing a row to the
    database for every request the patient is already waiting on.
    """
    return latency.snapshot()
