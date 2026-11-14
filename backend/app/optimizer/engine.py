from datetime import datetime, timedelta


def choose_window(forecast: list[dict], earliest: datetime, deadline: datetime, duration_hours: int) -> tuple[datetime, float] | None:
    candidates = []
    by_time = {item["timestamp"]: float(item["intensity"]) for item in forecast}
    for start in sorted(by_time):
        end = start + timedelta(hours=duration_hours)
        if start < earliest or end > deadline:
            continue
        hours = [start + timedelta(hours=offset) for offset in range(duration_hours)]
        if all(hour in by_time for hour in hours):
            candidates.append((start, sum(by_time[hour] for hour in hours) / duration_hours))
    return min(candidates, key=lambda candidate: candidate[1]) if candidates else None
