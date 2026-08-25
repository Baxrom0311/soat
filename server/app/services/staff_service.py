from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.enums import StaffRole
from app.models import Staff
from app.repositories import push_token_repo, staff_repo


def list_staff(db: Session, clinic_id: int) -> list[Staff]:
    return staff_repo.list_by_clinic(db, clinic_id)


def create_staff(db: Session, clinic_id: int, *, email: str, password: str, role: str, name: str) -> Staff:
    if role not in (StaffRole.ADMIN, StaffRole.NURSE):
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


def update_staff(
    db: Session,
    clinic_id: int,
    staff_id: int,
    *,
    name: str | None,
    email: str | None,
    role: str | None,
    password: str | None,
) -> Staff:
    staff = staff_repo.get(db, clinic_id, staff_id)
    if staff is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    if role is not None and role not in (StaffRole.ADMIN, StaffRole.NURSE):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'nurse'")
    # A clinic locked out of its own admin account can only be recovered by the
    # superadmin, so the last admin can never be demoted away via this endpoint.
    if role == StaffRole.NURSE and staff.role == StaffRole.ADMIN and staff_repo.count_admins(db, clinic_id) <= 1:
        raise HTTPException(status_code=409, detail="Clinic must keep at least one admin")

    if email is not None and email != staff.email:
        if staff_repo.get_by_email(db, email):
            raise HTTPException(status_code=409, detail="Email already registered")
        staff.email = email
    if name is not None:
        staff.name = name
    if role is not None:
        staff.role = role
    if password is not None:
        if len(password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        staff.password_hash = hash_password(password)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    db.refresh(staff)
    return staff


def delete_staff(db: Session, clinic_id: int, staff_id: int, *, requester_staff_id: int) -> None:
    staff = staff_repo.get(db, clinic_id, staff_id)
    if staff is None:
        raise HTTPException(status_code=404, detail="Staff not found")
    if staff.id == requester_staff_id:
        raise HTTPException(status_code=409, detail="Cannot delete your own account")
    if staff.role == StaffRole.ADMIN and staff_repo.count_admins(db, clinic_id) <= 1:
        raise HTTPException(status_code=409, detail="Clinic must keep at least one admin")

    # No ON DELETE CASCADE from push_tokens.staff_id -> staff.id, so this has to be
    # cleared first or the DELETE below hits a foreign-key violation.
    push_token_repo.delete_all_for_staff(db, staff.id)
    staff_repo.delete(db, staff)
    db.commit()
