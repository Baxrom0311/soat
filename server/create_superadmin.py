"""Create the platform superadmin account (role "superadmin", clinic_id NULL).

Usage:
    python create_superadmin.py admin@example.com s3cret-password
    python create_superadmin.py admin@example.com new-password --force   # reset password
    python create_superadmin.py admin@example.com s3cret --name "Boss" --database-url postgresql+psycopg://...
"""

import argparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import DATABASE_URL
from app.core.security import hash_password
from app.models import Staff


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a superadmin staff account (clinic_id NULL)")
    parser.add_argument("email", help="superadmin login email")
    parser.add_argument("password", help="superadmin login password")
    parser.add_argument("--name", default="Super Admin", help='display name (default "Super Admin")')
    parser.add_argument(
        "--force", action="store_true", help="reset the password if this superadmin already exists"
    )
    parser.add_argument("--database-url", default=None, help="override DATABASE_URL from .env")
    args = parser.parse_args()

    engine = create_engine(args.database_url or DATABASE_URL, future=True)
    with Session(engine) as db:
        existing = db.scalar(select(Staff).where(Staff.email == args.email))
        if existing is not None:
            if existing.role != "superadmin":
                raise SystemExit(
                    f"{args.email} already exists with role {existing.role!r} — refusing to touch it"
                )
            if not args.force:
                raise SystemExit(f"superadmin {args.email} already exists — use --force to reset the password")
            existing.password_hash = hash_password(args.password)
            existing.name = args.name
            db.commit()
            print(f"Password reset for superadmin {args.email}")
            return

        db.add(
            Staff(
                clinic_id=None,
                email=args.email,
                password_hash=hash_password(args.password),
                role="superadmin",
                name=args.name,
            )
        )
        db.commit()
        print(f"Superadmin {args.email} created")


if __name__ == "__main__":
    main()
