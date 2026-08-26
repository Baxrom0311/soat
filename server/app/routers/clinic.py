from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user_ungated, get_db, require_admin_ungated
from app.schemas.clinic import ClinicBillingNotice, ClinicBillingOut, ClinicOut
from app.services import clinic_service

router = APIRouter(prefix="/api/v1/clinic", tags=["clinic"])


@router.get("/me", response_model=ClinicOut)
# Ungated: this is where a blocked clinic reads why it is blocked and until when.
def get_my_clinic(user: CurrentUser = Depends(get_clinic_user_ungated), db: Session = Depends(get_db)):
    return clinic_service.get_my_clinic(db, user.clinic_id)


@router.get("/billing", response_model=ClinicBillingOut)
# Admin-only (prices), and ungated -- gating the payment screen behind payment would
# lock the clinic out of the one screen that gets it unblocked.
def get_billing(user: CurrentUser = Depends(require_admin_ungated), db: Session = Depends(get_db)):
    return clinic_service.get_billing(db, user.clinic_id)


@router.get("/billing-notice", response_model=ClinicBillingNotice)
# Any clinic member, including nurses: the phone app and the watch poll this to show an
# "obuna tugayapti" banner. Carries no financial data -- see ClinicBillingNotice.
def get_billing_notice(
    user: CurrentUser = Depends(get_clinic_user_ungated), db: Session = Depends(get_db)
):
    return clinic_service.get_billing_notice(db, user.clinic_id)


@router.get("/bill", response_class=HTMLResponse)
def get_bill(user: CurrentUser = Depends(require_admin_ungated), db: Session = Depends(get_db)):
    return HTMLResponse(clinic_service.render_bill_html(db, user.clinic_id))
