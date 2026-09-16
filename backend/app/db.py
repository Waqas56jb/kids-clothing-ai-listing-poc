from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
DATABASE_SSL = (os.getenv("DATABASE_SSL") or "").strip().lower()
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def enabled() -> bool:
    return postgres_enabled()


def postgres_enabled() -> bool:
    return bool(DATABASE_URL)


def storage_enabled() -> bool:
    return bool((os.getenv("S3_BUCKET") or "").strip())


def _with_ssl(url: str) -> str:
    if "sslmode=" in url:
        return url
    if DATABASE_SSL in {"disable", "false", "0"}:
        return url + ("&" if "?" in url else "?") + "sslmode=disable"
    # Local docker / private network often has no TLS.
    host = url.split("@")[-1].split("/")[0].split(":")[0].lower()
    if host in {"localhost", "127.0.0.1", "postgres", "db"}:
        return url + ("&" if "?" in url else "?") + "sslmode=disable"
    return url + ("&" if "?" in url else "?") + "sslmode=require"


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
        except Exception as exc:  # noqa: BLE001
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
            garment_count = coalesce(excluded.garment_count, public.jobs.garment_count),
            result = coalesce(excluded.result, public.jobs.result),
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
    del access_token
    if not postgres_enabled():
        raise RuntimeError("DATABASE_URL is not set")
    _pg_upsert_job(payload)


def fetch_job(job_id: str, access_token: str | None = None) -> dict[str, Any] | None:
    del access_token
    row = _pg_execute("select * from public.jobs where id = %s", (job_id,), fetch="one")
    return dict(row) if row else None


def list_jobs(user_id: str | None = None, access_token: str | None = None) -> list[dict[str, Any]]:
    del access_token
    if user_id:
        rows = _pg_execute(
            "select * from public.jobs where user_id = %s order by created_at desc",
            (user_id,),
            fetch="all",
        )
    else:
        rows = _pg_execute("select * from public.jobs order by created_at desc", fetch="all")
    return [dict(row) for row in (rows or [])]


def fetch_profile(user_id: str, access_token: str | None = None) -> dict[str, Any] | None:
    del access_token
    row = _pg_execute("select * from public.profiles where id = %s", (user_id,), fetch="one")
    return dict(row) if row else None


def fetch_profile_by_email(email: str) -> dict[str, Any] | None:
    row = _pg_execute(
        "select * from public.profiles where lower(email) = lower(%s)",
        (email.strip(),),
        fetch="one",
    )
    return dict(row) if row else None


def create_profile(email: str, password_hash: str, full_name: str | None = None, role: str = "seller") -> dict[str, Any]:
    row = _pg_execute(
        """
        insert into public.profiles (email, full_name, role, password_hash)
        values (%s, %s, %s, %s)
        returning *
        """,
        (email.strip().lower(), full_name or email.split("@")[0], role, password_hash),
        fetch="one",
    )
    return dict(row)


def upsert_profile_credentials(
    email: str,
    password_hash: str,
    full_name: str | None = None,
    role: str = "seller",
) -> dict[str, Any]:
    existing = fetch_profile_by_email(email)
    if existing:
        _pg_execute(
            """
            update public.profiles
            set password_hash = %s,
                full_name = coalesce(%s, full_name),
                role = %s,
                updated_at = now()
            where id = %s
            """,
            (password_hash, full_name, role, existing["id"]),
        )
        return fetch_profile(str(existing["id"])) or existing
    return create_profile(email, password_hash, full_name=full_name, role=role)


def set_profile_role(user_id: str, role: str) -> None:
    _pg_execute("update public.profiles set role = %s where id = %s", (role, user_id))


def record_job_file(job_id: str, kind: str, storage_path: str) -> None:
    _pg_execute(
        """
        insert into public.job_files (job_id, kind, storage_path)
        values (%s, %s, %s)
        on conflict (storage_path) do nothing
        """,
        (job_id, kind, storage_path),
    )


def get_workspace(job_id: str) -> dict[str, Any]:
    row = _pg_execute("select workspace from public.jobs where id = %s", (job_id,), fetch="one")
    if not row:
        return {}
    return dict(row.get("workspace") or {})


def set_workspace(job_id: str, workspace: dict[str, Any]) -> dict[str, Any]:
    from psycopg.types.json import Jsonb

    _pg_execute(
        "update public.jobs set workspace = %s, updated_at = now() where id = %s",
        (Jsonb(workspace), job_id),
    )
    return workspace


def merge_workspace(job_id: str, patch: dict[str, Any], replace_keys: list[str] | None = None) -> dict[str, Any]:
    replace = set(replace_keys or [])
    current = get_workspace(job_id)
    for key, value in patch.items():
        if key in replace or not isinstance(value, dict) or not isinstance(current.get(key), dict):
            current[key] = value
        else:
            merged = dict(current.get(key) or {})
            merged.update(value)
            current[key] = merged
    return set_workspace(job_id, current)


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
    return [
        part
        for part in parts
        if part.replace("--", "").strip()
        and not all(line.strip().startswith("--") or not line.strip() for line in part.splitlines())
    ]


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
    return {"ok": False, "mode": "none", "error": "DATABASE_URL is not set"}


def startup() -> None:
    if postgres_enabled():
        try:
            count = apply_schema()
            print(f"[db] applied {count} schema statements")
        except Exception as exc:  # noqa: BLE001
            print(f"[db] schema apply failed: {exc}")
    from app import blobstore

    blobstore.startup()
    status = ping()
    print(f"[db] ping {status}")
