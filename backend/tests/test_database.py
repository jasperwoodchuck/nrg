import logging

import pytest
from sqlalchemy.exc import OperationalError

from app.db import database


def test_initialize_database_retries_operational_errors(monkeypatch):
    attempts = 0
    delays = []

    def create_all(*, bind):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise OperationalError("CREATE TABLE", {}, RuntimeError("connection unavailable"))

    monkeypatch.setattr(database.Base.metadata, "create_all", create_all)
    monkeypatch.setattr(database.time, "sleep", delays.append)

    database.initialize_database()

    assert attempts == 3
    assert delays == [1, 2]


def test_initialize_database_logs_and_raises_after_retry_limit(monkeypatch, caplog):
    attempts = 0

    def create_all(*, bind):
        nonlocal attempts
        attempts += 1
        raise OperationalError("CREATE TABLE", {}, RuntimeError("connection unavailable"))

    monkeypatch.setattr(database.Base.metadata, "create_all", create_all)
    monkeypatch.setattr(database.time, "sleep", lambda _: None)

    with caplog.at_level(logging.ERROR, logger=database.__name__):
        with pytest.raises(OperationalError):
            database.initialize_database()

    assert attempts == database.DATABASE_STARTUP_ATTEMPTS
    assert "Check DATABASE_URL" in caplog.text
    assert "connection unavailable" not in caplog.text
