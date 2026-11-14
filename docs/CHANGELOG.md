# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-11-14

### Changed
- (2026-11-14) Scoped PLAN.md down to a software-only autonomous grid carbon optimizer; IoT/MQTT/hardware, auth, frontend, Postgres/Redis deferred.
- (2026-11-14) Recorded that PLAN.md was not present in the repository; used the requested prompt scope as the implementation source of truth and kept the API in the existing `backend/` project.

### Fixed
- (2026-11-14) Reject malformed upstream hourly series before persistence so collection falls back to cache/model data.
- (2026-11-14) Seed a computed template report on startup so report endpoints have demo content immediately.
- (2026-11-14) Standardize request validation errors on the documented JSON error envelope.

### Changed
- (2026-11-14) Hourly impact jobs persist recomputed aggregates, and daily report jobs append a fresh computed report each run.
- (2026-11-14) Add upstream pull time and actual cache age separately from job success in health responses.
- (2026-11-14) Order the 15-minute collector and optimizer in one sequential pipeline; limit simulator generation to one load per household per day.
- (2026-11-14) Canonicalize Open-Meteo local forecast timestamps to UTC and seed simulator RNG from configuration.

### Added
- (2026-11-14) Milestone 10: methodology/API/decision docs, README, environment example, Dockerfile, and one-command Makefile.
- (2026-11-14) Milestones 8–9: read-only API endpoints, demo-only simulator controls, computed insights, and template reports.
- (2026-11-14) Milestone 7: guarded collector, optimizer, simulator, aggregate, and daily report jobs with persisted last-success state.
- (2026-11-14) Milestone 6: fixed-seed virtual household fleet and seven-day simulated backfill records.
- (2026-11-14) Milestones 4–5: pure impact calculations for both baselines and deadline-/duration-aware low-carbon scheduling.
- (2026-11-14) Milestones 2–3: configurable deterministic fallback model, upstream response cache, and validated Open-Meteo collector.
- (2026-11-14) Milestone 1: backend package skeleton, environment-backed configuration, SQLite ORM models, factor-set version, and decision notes.
- (2026-11-14) Golden-value, deterministic fallback, optimizer constraint, collector failure, and API contract tests.
