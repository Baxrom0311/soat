from sqlalchemy.orm import Session

from app.models import Clinic
from app.repositories import clinic_repo


def get_my_clinic(db: Session, clinic_id: int) -> Clinic:
    return clinic_repo.get(db, clinic_id)
