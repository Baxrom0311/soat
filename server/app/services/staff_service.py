from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Staff
from app.repositories import staff_repo


def list_staff(db: Session, clinic_id: int) -> list[Staff]:
    return staff_repo.list_by_clinic(db, clinic_id)


def create_staff(db: Session, clinic_id: int, *, email: str, password: str, role: str, name: str) -> Staff:
    if role not in ("admin", "nurse"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'nurse'")
    if staff_repo.get_by_email(db, email):
        raise HTTPException(status_code=409, detail="Email already registered")

    # The pre-check races with concurrent creates on the unique email column; the
    # IntegrityError guard turns the loser's 500 into the same 409.
    try:
        staff = staff_repo.create(
            db, clinic_id=clinic_id, email=email, password_hash=hash_password(password), role=role, name=name
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    db.refresh(staff)
    return staff
