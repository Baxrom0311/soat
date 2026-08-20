from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    """Kept here too for backwards compatibility; app.core.deps.get_db is the canonical dependency."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
