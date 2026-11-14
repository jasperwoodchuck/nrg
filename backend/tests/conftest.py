import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.database import Base


def make_test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture(scope="module")
def api_engine():
    engine = make_test_engine()
    yield engine
    engine.dispose()


@pytest.fixture
def test_engine():
    engine = make_test_engine()
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture
def api_db_session(api_engine):
    with Session(api_engine) as session:
        yield session
