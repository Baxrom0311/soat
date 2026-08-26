from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_superadmin
from app.schemas.contact import ContactRequestAck, ContactRequestIn, ContactRequestOut
from app.services import contact_request_service

router = APIRouter(prefix="/api/v1/contact-requests", tags=["contact"])


@router.post("", response_model=ContactRequestAck, status_code=201)
def submit_contact_request(body: ContactRequestIn, request: Request, db: Session = Depends(get_db)):
    # Deliberately UNAUTHENTICATED: this is the public marketing page's call-back form,
    # filled in by people who have no account yet. Rate-limited per IP and length-capped
    # inside the service instead.
    client_ip = request.client.host if request.client else "unknown"
    contact_request_service.submit(
        db,
        name=body.name,
        phone=body.phone,
        clinic_name=body.clinic_name,
        message=body.message,
        client_ip=client_ip,
    )
    # Nothing about the stored row is echoed back -- an anonymous caller has no business
    # learning row ids or confirming what the server kept.
    return ContactRequestAck(ok=True)


@router.get("", response_model=list[ContactRequestOut])
def list_contact_requests(
    limit: int = Query(default=100, ge=1, le=500),
    _user=Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return contact_request_service.list_recent(db, limit)


@router.post("/{request_id}/handled", response_model=ContactRequestOut)
def mark_contact_request_handled(
    request_id: int,
    _user=Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return contact_request_service.mark_handled(db, request_id)
