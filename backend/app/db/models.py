from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class CacheRecord(Base):
    __tablename__ = "cache_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    payload: Mapped[str] = mapped_column(Text)


class ForecastRecord(Base):
    __tablename__ = "forecasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), unique=True, index=True)
    intensity: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20))
    weather_json: Mapped[str] = mapped_column(Text, default="{}")


class VirtualLoad(Base):
    __tablename__ = "virtual_loads"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(40))
    household: Mapped[int] = mapped_column(Integer)
    energy_kwh: Mapped[float] = mapped_column(Float)
    duration_hours: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    baseline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    chosen_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    optimized_intensity: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_intensity: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_average_intensity: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="SIMULATED")


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    body: Mapped[str] = mapped_column(Text)


class AppState(Base):
    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
