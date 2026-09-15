from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY") or ""


def enabled() -> bool:
    return bool(SUPABASE_URL and SECRET_KEY)


def _request(method: str, path: str, body: Any | None = None, extra_headers: dict[str, str] | None = None) -> Any:
    if not enabled():
        raise RuntimeError("Supabase is not configured")

    url = f"{SUPABASE_URL}{path}"
    headers = {
        "apikey": SECRET_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {path} failed ({exc.code}): {detail}") from exc


def upsert_job(payload: dict[str, Any]) -> None:
    _request(
        "POST",
        "/rest/v1/jobs?on_conflict=id",
        payload,
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def fetch_job(job_id: str) -> dict[str, Any] | None:
    rows = _request("GET", f"/rest/v1/jobs?id=eq.{job_id}&select=*")
    if not rows:
        return None
    return rows[0]


def list_jobs(user_id: str | None = None) -> list[dict[str, Any]]:
    path = "/rest/v1/jobs?select=*&order=created_at.desc"
    if user_id:
        path += f"&user_id=eq.{user_id}"
    return _request("GET", path) or []


def fetch_profile(user_id: str) -> dict[str, Any] | None:
    rows = _request("GET", f"/rest/v1/profiles?id=eq.{user_id}&select=*")
    if not rows:
        return None
    return rows[0]


def set_profile_role(user_id: str, role: str) -> None:
    _request("PATCH", f"/rest/v1/profiles?id=eq.{user_id}", {"role": role})


def to_iso(unix_seconds: float) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def from_iso(value: str | None, fallback: float) -> float:
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return fallback
