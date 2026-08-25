from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL

# The production Postgres instance this talks to has max_connections=25 total,
# shared with an unrelated "meter" service plus a few reserved superuser slots --
# pool_size=20/max_overflow=20 (this app's previous setting) could alone demand up
# to 40 connections, well past what the server can ever grant, and in practice sat
# at ~15 permanently-idle pooled connections even at near-zero traffic (confirmed
# via pg_stat_activity), which is most of the server's entire budget for a single
# process. Sized down to fit comfortably inside that real ceiling with headroom for
# the other consumers and for psql/Alembic/maintenance sessions to always be able to
# connect. Re-evaluate this constant if max_connections is ever raised server-side.
# pool_pre_ping guards against the DB provider silently closing idle connections
# server-side, which would otherwise surface as an intermittent 500 on whatever
# request drew the stale connection.
engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_size=5,
    max_overflow=3,
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
