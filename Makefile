.PHONY: run test

run:
	cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

test:
	cd backend && uv run pytest
