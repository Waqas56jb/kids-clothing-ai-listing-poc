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
PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def enabled() -> bool:
    return bool(SUPABASE_URL and (SECRET_KEY or PUBLISHABLE_KEY))


def postgres_enabled() -> bool:
    return bool(DATABASE_URL)


def storage_enabled() -> bool:
    return postgres_enabled() or enabled()


def _with_ssl(url: str) -> str:
    if "sslmode=" not in url:
        return url + ("&" if "?" in url else "?") + "sslmode=require"
    return url


def _pg_urls() -> list[str]:
    url = _with_ssl(DATABASE_URL)
    urls = [url]
    if ":6543/" in url:
        urls.append(url.replace(":6543/", ":5432/"))
    return urls


def _pg_connect():
    import psycopg
    from psycopg.rows import dict_row

    last_error: Exception | None = None
    for url in _pg_urls():
        try:
            return psycopg.connect(url, row_factory=dict_row, prepare_threshold=None)
        except Exception as exc:  # noqa: BLE001 — try the next pooler port
            last_error = exc
    raise RuntimeError(f"Postgres connect failed: {last_error}") from last_error


def _pg_execute(sql: str, params: tuple[Any, ...] | None = None, fetch: str | None = None) -> Any:
    with _pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if fetch == "one":
                return cur.fetchone()
            if fetch == "all":
                return cur.fetchall()
            return None


def _request(
    method: str,
    path: str,
    body: Any | None = None,
    extra_headers: dict[str, str] | None = None,
    access_token: str | None = None,
    use_secret: bool = False,
) -> Any:
    if not enabled():
        raise RuntimeError("Supabase is not configured")

    if use_secret:
        api_key = SECRET_KEY or PUBLISHABLE_KEY
    elif access_token:
        api_key = PUBLISHABLE_KEY or SECRET_KEY
    else:
        api_key = SECRET_KEY or PUBLISHABLE_KEY

    headers = {
        "apikey": api_key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    elif use_secret and SECRET_KEY:
        headers["Authorization"] = f"Bearer {SECRET_KEY}"
    if extra_headers:
        headers.update(extra_headers)

    url = f"{SUPABASE_URL}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {path} failed ({exc.code}): {detail}") from exc


def _pg_upsert_job(payload: dict[str, Any]) -> None:
    from psycopg.types.json import Jsonb

    result = payload.get("result")
    _pg_execute(
        """
        insert into public.jobs (
            id, user_id, status, stage, current, total, error,
            image_count, garment_count, result, created_at, updated_at
        ) values (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            coalesce(%s::timestamptz, now()), now()
        )
        on conflict (id) do update set
            user_id = coalesce(excluded.user_id, public.jobs.user_id),
            status = excluded.status,
            stage = excluded.stage,
            current = excluded.current,
            total = excluded.total,
            error = excluded.error,
            image_count = excluded.image_count,
            garment_count = excluded.garment_count,
            result = excluded.result,
            updated_at = now()
        """,
        (
            payload["id"],
            payload.get("user_id") or None,
            payload.get("status") or "queued",
            payload.get("stage"),
            int(payload.get("current") or 0),
            int(payload.get("total") or 0),
            payload.get("error"),
            int(payload.get("image_count") or 0),
            payload.get("garment_count"),
            Jsonb(result) if result is not None else None,
            payload.get("created_at"),
        ),
    )


def upsert_job(payload: dict[str, Any], access_token: str | None = None) -> None:
    """Save a job so local and Railway both read the same Postgres row."""
    errors: list[str] = []

    if postgres_enabled():
        try:
            _pg_upsert_job(payload)
            return
        except Exception as exc:  # noqa: BLE001 — fall through to REST
            errors.append(f"postgres: {exc}")

    if access_token:
        try:
            _request(
                "POST",
                "/rest/v1/rpc/save_job",
                {"p": payload},
                extra_headers={"Prefer": "return=minimal"},
                access_token=access_token,
            )
            return
        except RuntimeError as exc:
            errors.append(str(exc))
        try:
            _request(
                "POST",
                "/rest/v1/jobs?on_conflict=id",
                payload,
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                access_token=access_token,
            )
            return
        except RuntimeError as exc:
            errors.append(str(exc))

    try:
        _request(
            "POST",
            "/rest/v1/jobs?on_conflict=id",
            payload,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            use_secret=True,
        )
        return
    except RuntimeError as exc:
        errors.append(str(exc))

    raise RuntimeError(" ; ".join(errors) or "Job persist failed")


def fetch_job(job_id: str, access_token: str | None = None) -> dict[str, Any] | None:
    if postgres_enabled():
        row = _pg_execute("select * from public.jobs where id = %s", (job_id,), fetch="one")
        return dict(row) if row else None
    rows = _request("GET", f"/rest/v1/jobs?id=eq.{job_id}&select=*", access_token=access_token)
    if not rows:
        return None
    return rows[0]


def list_jobs(user_id: str | None = None, access_token: str | None = None) -> list[dict[str, Any]]:
    if postgres_enabled():
        if user_id:
            rows = _pg_execute(
                "select * from public.jobs where user_id = %s order by created_at desc",
                (user_id,),
                fetch="all",
            )
        else:
            rows = _pg_execute(
                "select * from public.jobs order by created_at desc",
                fetch="all",
            )
        return [dict(row) for row in (rows or [])]

    path = "/rest/v1/jobs?select=*&order=created_at.desc"
    if user_id:
        path += f"&user_id=eq.{user_id}"
    return _request("GET", path, access_token=access_token) or []


def fetch_profile(user_id: str, access_token: str | None = None) -> dict[str, Any] | None:
    if postgres_enabled():
        row = _pg_execute("select * from public.profiles where id = %s", (user_id,), fetch="one")
        if row:
            return dict(row)
    try:
        rows = _request("GET", f"/rest/v1/profiles?id=eq.{user_id}&select=*", access_token=access_token)
    except RuntimeError:
        rows = None
    if not rows:
        return None
    return rows[0]


def set_profile_role(user_id: str, role: str) -> None:
    if postgres_enabled():
        _pg_execute("update public.profiles set role = %s where id = %s", (role, user_id))
        return
    _request("PATCH", f"/rest/v1/profiles?id=eq.{user_id}", {"role": role}, use_secret=True)


def to_iso(unix_seconds: float) -> str:
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def from_iso(value: str | None, fallback: float) -> float:
    if not value:
        return fallback
    try:
        if hasattr(value, "timestamp"):
            return value.timestamp()
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return fallback


def split_sql(sql: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_dollar = False
    i = 0
    while i < len(sql):
        if sql[i : i + 2] == "$$":
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        if not in_dollar and sql[i] == ";":
            statement = "".join(buf).strip()
            if statement.replace("--", "").strip():
                parts.append(statement)
            buf = []
            i += 1
            continue
        buf.append(sql[i])
        i += 1
    leftover = "".join(buf).strip()
    if leftover:
        parts.append(leftover)
    return [part for part in parts if part.replace("--", "").strip() and not all(
        line.strip().startswith("--") or not line.strip() for line in part.splitlines()
    )]


def apply_schema() -> int:
    if not postgres_enabled():
        raise RuntimeError("DATABASE_URL is not set")
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    statements = split_sql(sql)
    with _pg_connect() as conn:
        with conn.cursor() as cur:
            for statement in statements:
                cur.execute(statement)
        conn.commit()
    return len(statements)


def ping() -> dict[str, Any]:
    if postgres_enabled():
        try:
            row = _pg_execute("select count(*) as job_count from public.jobs", fetch="one")
            return {"ok": True, "mode": "postgres", "job_count": int((row or {}).get("job_count") or 0)}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "mode": "postgres", "error": str(exc)[:180]}
    if enabled():
        try:
            rows = _request("GET", "/rest/v1/jobs?select=id&limit=1", use_secret=True)
            return {"ok": True, "mode": "rest", "job_count": len(rows or [])}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "mode": "rest", "error": str(exc)[:180]}
    return {"ok": False, "mode": "none", "error": "Supabase is not configured"}


def startup() -> None:
    if postgres_enabled():
        try:
            count = apply_schema()
            print(f"[db] applied {count} schema statements")
        except Exception as exc:  # noqa: BLE001
            print(f"[db] schema apply failed: {exc}")
    status = ping()
    print(f"[db] ping {status}")
