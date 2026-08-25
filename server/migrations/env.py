"""Alembic environment.

Reads DATABASE_URL exactly the way app.core.config does (same load_dotenv(), same
fallback default) so `alembic` and the running app can never silently target different
databases. Imports app.models (not just app.database) so every mapped class is
registered on Base.metadata before it's handed to Alembic as target_metadata -- this is
what makes `alembic revision --autogenerate` work correctly against future model
changes. Importing app.database alone would leave Base.metadata empty.
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the project root (the directory containing the app/ package -- i.e. this repo's
# server/ directory) importable regardless of the working directory `alembic` is
# invoked from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import DATABASE_URL  # noqa: E402
from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  -- side effect: populates Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Never trust alembic.ini's sqlalchemy.url. Always use the same DATABASE_URL the app
# process resolves (app.core.config), so a stale/forgotten alembic.ini edit can never
# point migrations at the wrong database.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
