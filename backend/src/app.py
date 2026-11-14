"""Compatibility import for older `uvicorn src.app:app` launch commands."""

from app.main import app

__all__ = ["app"]
