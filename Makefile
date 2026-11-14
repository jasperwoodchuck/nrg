.PHONY: dev frontend backend install lint format test clean

dev:
	@echo "Starting frontend and backend..."
	@trap 'kill 0' INT; \
	(cd frontend && bun run dev) & \
	(cd backend && uv run uvicorn src.app:app --reload) & \
	wait

frontend:
	cd frontend && bun run dev

frontend-build:
	cd frontend && bun run build

backend:
	cd backend && uv run uvicorn src.app:app --reload

backend-run:
	cd backend && uv run uvicorn src.app:app

install:
	cd frontend && bun install
	cd backend && uv sync

lint:
	cd frontend && bun run lint
	cd backend && uv run ruff check .

# Format
format:
	cd frontend && bun run format
	cd backend && uv run ruff format .

test:
	cd frontend && bun run test
	cd backend && uv run pytest

clean:
	cd frontend && rm -rf dist
	cd backend && find . -type d -name "__pycache__" -exec rm -rf {} +
