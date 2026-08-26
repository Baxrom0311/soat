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

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Expo rejects requests with more than 100 messages, so large clinics must be chunked.
EXPO_PUSH_CHUNK_SIZE = 100


def send_new_call_notifications(clinic_id: int, *, call_id: int, room_number: str, floor: int) -> None:
    """Fetch every registered push token for this clinic and push an Expo notification
    to each. Opens its own DB session -- by the time a BackgroundTask runs, the
    request-scoped session may be running on a different worker thread, so sharing it
    isn't worth the risk for a non-critical side effect.
    """
    db: Session = SessionLocal()
    try:
        tokens = push_token_repo.list_by_clinic_for_floor(db, clinic_id, floor)
        if not tokens:
            logger.info("No push tokens registered for clinic_id=%s, skipping push", clinic_id)
            return

        messages = [
            {
                "to": token.expo_push_token,
                "title": f"Xona {room_number} chaqirdi!",
                "body": f"{floor}-qavat",
                "data": {"call_id": call_id, "room_number": room_number, "floor": floor},
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
                    clinic_id, call_id, len(chunk_messages),
                )
                continue

            logger.info(
                "Expo push send -> status=%s clinic_id=%s call_id=%s tokens=%d",
                resp.status_code, clinic_id, call_id, len(chunk_messages),
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

    for token, ticket in zip(tokens, tickets):
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
