"""Expo push notification delivery for new calls.

This runs as a FastAPI BackgroundTask *after* the call has already been committed,
broadcast over the dashboard websocket, and the HTTP response to the ESP32 device has
been sent -- it is a pure side effect. Nothing in here may ever raise: any failure
(network error, invalid token, Expo API error) is logged and swallowed so it can never
take down or delay the main /api/v1/calls ingestion flow.
"""

import logging

import requests
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import PushToken
from app.repositories import push_token_repo
from app.services import fcm_service

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Expo rejects requests with more than 100 messages, so large clinics must be chunked.
EXPO_PUSH_CHUNK_SIZE = 100


def send_new_call_notifications(
    clinic_id: int,
    *,
    call_id: int,
    room_number: str,
    floor: int,
    waited_seconds: int | None = None,
) -> None:
    """Alert every nurse responsible for this floor, over whichever push service her
    app generation uses. Opens its own DB session -- by the time a BackgroundTask runs,
    the request-scoped session may be running on a different worker thread, so sharing
    it isn't worth the risk for a non-critical side effect.
    """
    db: Session = SessionLocal()
    try:
        all_tokens = push_token_repo.list_by_clinic_for_floor(db, clinic_id, floor)
        if not all_tokens:
            logger.info("No push tokens registered for clinic_id=%s, skipping push", clinic_id)
            return

        # A repeat says how long the patient has been waiting. The first alert
        # cannot -- there is nothing to report yet -- but by the third one the
        # number is the whole message: it is the difference between "somebody
        # called" and "somebody has been calling for nine minutes".
        if waited_seconds is None:
            title = f"Xona {room_number} chaqirdi!"
            body = f"{floor}-qavat"
        else:
            minutes = max(1, round(waited_seconds / 60))
            title = f"Xona {room_number} — {minutes} daqiqa kutyapti"
            body = f"{floor}-qavat · javob berilmadi"
        payload = {"call_id": call_id, "room_number": room_number, "floor": floor}

        # Two app generations are in the field at once while clinics migrate off the
        # Expo build, and the token itself says which is which: Expo's are always
        # `ExponentPushToken[...]`, FCM registration tokens never are. Routing on the
        # shape means no migration flag, no per-clinic switch, and no moment where a
        # nurse who has not updated yet stops receiving calls.
        expo_tokens = [t for t in all_tokens if t.expo_push_token.startswith("ExponentPushToken[")]
        fcm_tokens = [t for t in all_tokens if not t.expo_push_token.startswith("ExponentPushToken[")]

        if fcm_tokens:
            _send_fcm(
                db, fcm_tokens, title=title, body=body, data=payload, clinic_id=clinic_id, call_id=call_id
            )

        tokens = expo_tokens
        if not tokens:
            db.commit()
            return

        messages = [
            {
                "to": token.expo_push_token,
                "title": title,
                "body": body,
                "data": payload,
                "priority": "high",
                "sound": "default",
            }
            for token in tokens
        ]

        for start in range(0, len(messages), EXPO_PUSH_CHUNK_SIZE):
            chunk_tokens = tokens[start : start + EXPO_PUSH_CHUNK_SIZE]
            chunk_messages = messages[start : start + EXPO_PUSH_CHUNK_SIZE]
            try:
                resp = requests.post(
                    EXPO_PUSH_URL,
                    json=chunk_messages,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                    timeout=10,
                )
            except requests.RequestException:
                logger.exception(
                    "Expo push request failed for clinic_id=%s call_id=%s (chunk of %d tokens)",
                    clinic_id,
                    call_id,
                    len(chunk_messages),
                )
                continue

            logger.info(
                "Expo push send -> status=%s clinic_id=%s call_id=%s tokens=%d",
                resp.status_code,
                clinic_id,
                call_id,
                len(chunk_messages),
            )

            if resp.status_code >= 400:
                logger.warning("Expo push API returned an error: %s", resp.text)
                continue

            try:
                payload = resp.json()
            except ValueError:
                logger.warning("Expo push API returned a non-JSON body: %s", resp.text)
                continue

            _cleanup_invalid_tokens(db, payload, chunk_tokens)

        db.commit()
    except Exception:
        logger.exception(
            "Unexpected error sending push notifications for clinic_id=%s call_id=%s", clinic_id, call_id
        )
    finally:
        db.close()


def _cleanup_invalid_tokens(db: Session, payload: dict, tokens: list[PushToken]) -> None:
    """Expo returns one 'ticket' per message, in the same order as the request array.
    A ticket with status == 'error' and details.error == 'DeviceNotRegistered' means
    the token is permanently dead (app uninstalled, etc.) -- delete it so we stop
    wasting requests on it.
    """
    tickets = payload.get("data")
    if not isinstance(tickets, list):
        logger.warning("Unexpected Expo push response shape: %r", payload)
        return

    for token, ticket in zip(tokens, tickets, strict=False):
        if not isinstance(ticket, dict):
            continue
        status = ticket.get("status")
        if status != "error":
            continue
        error_type = (ticket.get("details") or {}).get("error")
        logger.warning(
            "Expo push error for token=%s: %s (%s)", token.expo_push_token, ticket.get("message"), error_type
        )
        if error_type == "DeviceNotRegistered":
            push_token_repo.delete_by_token(db, token.expo_push_token)
            logger.info("Removed dead push token=%s", token.expo_push_token)


def _send_fcm(
    db: Session,
    tokens: list[PushToken],
    *,
    title: str,
    body: str,
    data: dict,
    clinic_id: int,
    call_id: int,
) -> None:
    """One request per token: FCM HTTP v1 has no multicast. A clinic has a handful of
    nurses, so the loop is cheap -- and a failure on one nurse's phone must not stop the
    message reaching the others, which a batch would risk.
    """
    if not fcm_service.is_configured():
        logger.warning(
            "FCM tokens registered for clinic_id=%s but FCM is not configured -- %d nurse(s) "
            "will not be alerted",
            clinic_id,
            len(tokens),
        )
        return

    sent = 0
    for token in tokens:
        error = fcm_service.send(token.expo_push_token, title=title, body=body, data=data)
        if error is None:
            sent += 1
            continue
        # Only these two mean the registration is permanently gone. Everything else --
        # quota, server error, network -- is transient, and deleting a token over a
        # transient failure silently unsubscribes a nurse until she reinstalls.
        if error in ("UNREGISTERED", "INVALID_ARGUMENT"):
            push_token_repo.delete_by_token(db, token.expo_push_token)
            logger.info("Removed dead FCM token (%s)", error)

    logger.info(
        "FCM push -> delivered=%d/%d clinic_id=%s call_id=%s",
        sent,
        len(tokens),
        clinic_id,
        call_id,
    )
