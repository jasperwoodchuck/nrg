import logging
import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

DATABASE_STARTUP_ATTEMPTS = 3
DATABASE_STARTUP_RETRY_DELAY_SECONDS = 1
POSTGRES_CONNECT_TIMEOUT_SECONDS = 10


class Base(DeclarativeBase):
    pass


database_url = make_url(settings.database_url)
if database_url.drivername in {"postgres", "postgresql"}:
    database_url = database_url.set(drivername="postgresql+psycopg")

connect_args = {"check_same_thread": False} if database_url.drivername.startswith("sqlite") else {}
if database_url.drivername.startswith("postgresql"):
    connect_args["connect_timeout"] = POSTGRES_CONNECT_TIMEOUT_SECONDS

engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def initialize_database() -> None:
    """Create missing tables, retrying transient connection failures before failing startup."""
    for attempt in range(1, DATABASE_STARTUP_ATTEMPTS + 1):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError as error:
            if attempt == DATABASE_STARTUP_ATTEMPTS:
                logger.error(
                    "Database initialization failed after %d attempts (%s). "
                    "Check DATABASE_URL, database availability, network routing, and TLS settings.",
                    attempt,
                    type(error).__name__,
                )
                raise

            delay = DATABASE_STARTUP_RETRY_DELAY_SECONDS * attempt
            logger.warning(
                "Database connection failed during initialization (%s); "
                "retrying in %d second(s), attempt %d/%d.",
                type(error).__name__,
                delay,
                attempt + 1,
                DATABASE_STARTUP_ATTEMPTS,
            )
            time.sleep(delay)


def get_session():
    with SessionLocal() as session:
        yield session
