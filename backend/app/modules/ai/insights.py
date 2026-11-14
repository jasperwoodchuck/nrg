import json
from collections.abc import Mapping

import httpx

from app.core.config import settings

GEMINI_MODEL = settings.gemini_model
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
GEMINI_REQUEST_TIMEOUT_SECONDS = 20
MAX_INSIGHT_LENGTH = 800


class GeminiInsightError(RuntimeError):
    """Gemini failed to return a usable insight."""


class GeminiKeyMissingError(GeminiInsightError):
    """The backend has no Gemini API key configured."""


def generate_grid_insight(facts: Mapping[str, int | float | str | None]) -> str:
    api_key = settings.gemini_api_key
    if not api_key:
        raise GeminiKeyMissingError("GEMINI_API_KEY is not configured")

    prompt = (
        "Write one concise, useful grid-energy insight (2–3 sentences) based only on the JSON facts below. "
        "These figures are simulated fleet results and estimated/forecast grid data, not live meter readings. "
        "Do not invent measurements, causes, or recommendations that the facts do not support. "
        "State when the available data is insufficient. Return plain text only.\n\n"
        f"Facts: {json.dumps(dict(facts), separators=(',', ':'), allow_nan=False)}"
    )
    request_body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 220},
    }

    try:
        with httpx.Client(timeout=GEMINI_REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(
                GEMINI_API_URL,
                headers={"x-goog-api-key": api_key},
                json=request_body,
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise GeminiInsightError("Gemini request failed") from error

    try:
        payload = response.json()
    except ValueError as error:
        raise GeminiInsightError("Gemini returned invalid JSON") from error

    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
        raise GeminiInsightError("Gemini returned no candidate")
    content = candidates[0].get("content")
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise GeminiInsightError("Gemini candidate did not contain text parts")

    text = " ".join(
        part["text"].strip()
        for part in parts
        if isinstance(part, dict)
        and part.get("thought") is not True
        and isinstance(part.get("text"), str)
        and part["text"].strip()
    ).strip()
    if not text or len(text) > MAX_INSIGHT_LENGTH:
        raise GeminiInsightError("Gemini returned empty or oversized insight text")
    return text


def generate_energy_usage_insight(facts: Mapping[str, object], language: str) -> str:
    api_key = settings.gemini_api_key
    if not api_key:
        raise GeminiKeyMissingError("GEMINI_API_KEY is not configured")

    prompt = (
        "Give 2–4 concise, useful observations about this household's electricity use, followed by practical ways to reduce it. "
        "Use only the supplied facts and write in the requested language. Appliance energy is an estimate from rated watts, "
        "quantity, daily hours, and period length; it may not match actual measured appliance use. The meter total and emissions "
        "are user-entered or factor-based estimates, not verified meter or emissions readings. Do not invent a tariff, device behavior, "
        "or savings. Do not repeat unsupported numeric claims; explain if appliance estimates exceed the meter total. Return plain text only.\n\n"
        f"Language: {language}\nFacts: {json.dumps(dict(facts), separators=(',', ':'), allow_nan=False)}"
    )
    request_body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 360},
    }
    try:
        with httpx.Client(timeout=GEMINI_REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(
                GEMINI_API_URL,
                headers={"x-goog-api-key": api_key},
                json=request_body,
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise GeminiInsightError("Gemini request failed") from error

    try:
        payload = response.json()
    except ValueError as error:
        raise GeminiInsightError("Gemini returned invalid JSON") from error

    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
        raise GeminiInsightError("Gemini returned no candidate")
    content = candidates[0].get("content")
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise GeminiInsightError("Gemini candidate did not contain text parts")
    text = " ".join(
        part["text"].strip()
        for part in parts
        if isinstance(part, dict)
        and part.get("thought") is not True
        and isinstance(part.get("text"), str)
        and part["text"].strip()
    ).strip()
    if not text or len(text) > 1600:
        raise GeminiInsightError("Gemini returned empty or oversized analysis text")
    return text
