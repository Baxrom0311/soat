from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL

# pool_size+max_overflow sized for a shift-change burst (multiple nurses reloading
# dashboards plus concurrent ESP32 posts); pool_pre_ping guards against the DB
# provider silently closing idle connections server-side, which would otherwise
# surface as an intermittent 500 on whatever request drew the stale connection.
engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_size=20,
    max_overflow=20,
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)
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
