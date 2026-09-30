"""FCM HTTP v1 delivery, for the Flutter app.

The Expo-built app and the Flutter one will be in the field at the same time while
clinics migrate, so both delivery paths have to work side by side. push_service routes
each token to the right one by its shape; this module only knows how to talk to Google.

Nothing in here may raise. Push is a side effect of a call that has already been
committed, broadcast over the websocket and answered to the ESP32 -- a failure here must
degrade the alert, never the call.
"""

import json
import logging
import threading

import requests

from app.core.config import FCM_SERVICE_ACCOUNT_FILE

logger = logging.getLogger(__name__)

_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_TIMEOUT = 10

# google-auth refreshes the access token itself, but the Credentials object is not
# documented as thread-safe and a BackgroundTask may run on any worker thread.
_lock = threading.Lock()
_credentials = None
_project_id: str | None = None
_unavailable_reason: str | None = None


def is_configured() -> bool:
    return bool(FCM_SERVICE_ACCOUNT_FILE)


def _load() -> tuple[object, str] | None:
    """Returns (credentials, project_id), or None when FCM cannot be used.

    The reason is logged exactly once. A misconfigured key would otherwise produce one
    identical error per call per nurse, which buries everything else in the journal.
    """
    global _credentials, _project_id, _unavailable_reason

    if _credentials is not None and _project_id is not None:
        return _credentials, _project_id
    if _unavailable_reason is not None:
        return None

    if not FCM_SERVICE_ACCOUNT_FILE:
        _unavailable_reason = "FCM_SERVICE_ACCOUNT_FILE sozlanmagan"
        logger.info("FCM o'chiq: %s", _unavailable_reason)
        return None

    try:
        from google.auth.transport.requests import Request  # noqa: F401
        from google.oauth2 import service_account
    except ImportError:
        _unavailable_reason = "google-auth o'rnatilmagan"
        logger.error("FCM ishlatib bo'lmaydi: %s", _unavailable_reason)
        return None

    try:
        with open(FCM_SERVICE_ACCOUNT_FILE, encoding="utf-8") as fh:
            info = json.load(fh)
        project_id = info.get("project_id")
        if not project_id:
            raise ValueError("service account faylida project_id yo'q")
        creds = service_account.Credentials.from_service_account_info(info, scopes=[_SCOPE])
    except Exception as exc:
        # The path and the exception type are safe to log; the key material is not, so
        # the exception is not logged with a traceback that could echo file contents.
        _unavailable_reason = f"{type(exc).__name__}"
        logger.error(
            "FCM service account o'qilmadi (%s): %s", FCM_SERVICE_ACCOUNT_FILE, _unavailable_reason
        )
        return None

    _credentials, _project_id = creds, project_id
    logger.info("FCM sozlandi, project_id=%s", project_id)
    return _credentials, _project_id


def _access_token() -> str | None:
    loaded = _load()
    if loaded is None:
        return None
    creds, _ = loaded
    try:
        from google.auth.transport.requests import Request

        with _lock:
            if not creds.valid:
                creds.refresh(Request())
            return creds.token
    except Exception:
        logger.exception("FCM access token olinmadi")
        return None


def send(token: str, *, title: str, body: str, data: dict[str, str]) -> str | None:
    """Delivers one message. Returns an FCM error code when the token is permanently
    dead so the caller can drop it, and None in every other case -- including transient
    failures, which must not cost a nurse her registration.
    """
    loaded = _load()
    if loaded is None:
        return None
    _, project_id = loaded

    access = _access_token()
    if access is None:
        return None

    # Data-only, with no `notification` block, and that is the whole point.
    #
    # A message carrying `notification` is rendered by the Android system itself while
    # the app is backgrounded, and the system will not raise a full-screen intent, use
    # the alarm audio stream, or keep the alert on screen until somebody answers. Only a
    # notification the app builds can do those, and the app only gets the chance when the
    # payload is data-only.
    #
    # The cost is that a force-stopped app receives nothing -- but a force-stopped app
    # receives no notification payload either, so nothing is actually given up.
    payload = {
        "message": {
            "token": token,
            # Every value must be a string: FCM rejects the whole message otherwise, and
            # call_id is an int on our side. title/body ride along so the phone renders
            # the same words the Expo build does.
            "data": {
                **{k: str(v) for k, v in data.items()},
                "title": title,
                "body": body,
            },
            "android": {
                # "high" is what lets a data-only message through Doze on a phone that
                # has been in a pocket all shift. At normal priority Android may hold it
                # for minutes, which for this product is the same as losing it.
                "priority": "high",
            },
        }
    }

    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {access}",
                "Content-Type": "application/json; UTF-8",
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException:
        logger.exception("FCM so'rovi yuborilmadi")
        return None

    if resp.status_code < 300:
        return None

    error_code = None
    try:
        err = resp.json().get("error", {})
        for detail in err.get("details", []):
            if detail.get("@type", "").endswith("FcmError"):
                error_code = detail.get("errorCode")
        error_code = error_code or err.get("status")
    except ValueError:
        pass

    logger.warning("FCM xato: status=%s code=%s", resp.status_code, error_code)
    return error_code
