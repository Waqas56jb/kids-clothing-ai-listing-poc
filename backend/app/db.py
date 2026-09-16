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


# ---------------------------------------------------------------------------
# Marketplace: published listings, favorites, offers
# ---------------------------------------------------------------------------

_LISTING_COLUMNS = (
    "l.id, l.job_id, l.garment_id, l.seller_id, l.title, l.description, l.category, l.brand, "
    "l.size, l.color, l.condition, l.gender, l.defects, l.price, l.currency, l.images, "
    "l.cover_image, l.status, l.created_at, l.updated_at, p.full_name as seller_name"
)


def _listing_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    for key in ("id", "seller_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    data["images"] = list(data.get("images") or [])
    return data


def insert_listing(listing: dict[str, Any]) -> dict[str, Any]:
    from psycopg.types.json import Jsonb

    row = _pg_execute(
        """
        insert into public.listings (
            job_id, garment_id, seller_id, title, description, category, brand, size, color,
            condition, gender, defects, price, currency, images, cover_image, status
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (job_id, garment_id) do update set
            title = excluded.title,
            description = excluded.description,
            category = excluded.category,
            brand = excluded.brand,
            size = excluded.size,
            color = excluded.color,
            condition = excluded.condition,
            gender = excluded.gender,
            defects = excluded.defects,
            price = excluded.price,
            images = excluded.images,
            cover_image = excluded.cover_image,
            status = 'published',
            updated_at = now()
        returning id
        """,
        (
            listing.get("job_id"),
            listing.get("garment_id"),
            listing.get("seller_id"),
            listing.get("title"),
            listing.get("description"),
            listing.get("category"),
            listing.get("brand"),
            listing.get("size"),
            listing.get("color"),
            listing.get("condition"),
            listing.get("gender"),
            listing.get("defects"),
            int(listing.get("price") or 0),
            listing.get("currency") or "SEK",
            Jsonb(list(listing.get("images") or [])),
            listing.get("cover_image"),
            listing.get("status") or "published",
        ),
        fetch="one",
    )
    return fetch_listing(str(row["id"]))  # type: ignore[index]


def fetch_listing(listing_id: str) -> dict[str, Any] | None:
    row = _pg_execute(
        f"select {_LISTING_COLUMNS} from public.listings l left join public.profiles p on p.id = l.seller_id where l.id = %s",
        (listing_id,),
        fetch="one",
    )
    return _listing_row(row)


def list_public_listings(
    query: str | None = None,
    category: str | None = None,
    size: str | None = None,
    condition: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    sort: str = "newest",
    limit: int = 60,
    offset: int = 0,
) -> list[dict[str, Any]]:
    clauses = ["l.status = 'published'"]
    params: list[Any] = []
    if query:
        clauses.append(
            "(l.title ilike %s or l.description ilike %s or coalesce(l.brand, '') ilike %s or coalesce(l.color, '') ilike %s)"
        )
        like = f"%{query.strip()}%"
        params.extend([like, like, like, like])
    if category:
        clauses.append("l.category = %s")
        params.append(category)
    if size:
        clauses.append("lower(coalesce(l.size, '')) = lower(%s)")
        params.append(size)
    if condition:
        clauses.append("l.condition = %s")
        params.append(condition)
    if min_price is not None:
        clauses.append("l.price >= %s")
        params.append(int(min_price))
    if max_price is not None:
        clauses.append("l.price <= %s")
        params.append(int(max_price))
    order = {
        "price_asc": "l.price asc, l.created_at desc",
        "price_desc": "l.price desc, l.created_at desc",
    }.get(sort, "l.created_at desc")
    params.extend([int(limit), int(offset)])
    rows = _pg_execute(
        f"select {_LISTING_COLUMNS} from public.listings l left join public.profiles p on p.id = l.seller_id "
        f"where {' and '.join(clauses)} order by {order} limit %s offset %s",
        tuple(params),
        fetch="all",
    )
    return [_listing_row(row) for row in (rows or [])]


def is_public_image(storage_path: str) -> bool:
    """True when the file is referenced by a published (or sold) listing."""
    if not postgres_enabled():
        return False
    try:
        row = _pg_execute(
            "select 1 from public.listings where status in ('published', 'sold') and images ? %s limit 1",
            (storage_path,),
            fetch="one",
        )
    except Exception:  # noqa: BLE001 -- fail closed
        return False
    return row is not None


def listing_facets() -> dict[str, Any]:
    categories = _pg_execute(
        "select category, count(*) as count from public.listings where status = 'published' group by category order by count desc",
        fetch="all",
    )
    sizes = _pg_execute(
        "select size, count(*) as count from public.listings where status = 'published' and size is not null group by size order by size",
        fetch="all",
    )
    return {
        "categories": [dict(row) for row in (categories or [])],
        "sizes": [dict(row) for row in (sizes or [])],
    }


def list_seller_listings(seller_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        f"select {_LISTING_COLUMNS} from public.listings l left join public.profiles p on p.id = l.seller_id "
        "where l.seller_id = %s order by l.created_at desc",
        (seller_id,),
        fetch="all",
    )
    return [_listing_row(row) for row in (rows or [])]


def list_all_listings() -> list[dict[str, Any]]:
    rows = _pg_execute(
        f"select {_LISTING_COLUMNS} from public.listings l left join public.profiles p on p.id = l.seller_id "
        "order by l.created_at desc",
        fetch="all",
    )
    return [_listing_row(row) for row in (rows or [])]


def update_listing(listing_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {"title", "description", "price", "status", "category", "brand", "size", "color", "condition", "gender", "defects"}
    sets: list[str] = []
    params: list[Any] = []
    for key, value in patch.items():
        if key in allowed:
            sets.append(f"{key} = %s")
            params.append(int(value) if key == "price" and value is not None else value)
    if not sets:
        return fetch_listing(listing_id)
    sets.append("updated_at = now()")
    params.append(listing_id)
    _pg_execute(f"update public.listings set {', '.join(sets)} where id = %s", tuple(params))
    return fetch_listing(listing_id)


def add_favorite(user_id: str, listing_id: str) -> None:
    _pg_execute(
        "insert into public.favorites (user_id, listing_id) values (%s, %s) on conflict do nothing",
        (user_id, listing_id),
    )


def remove_favorite(user_id: str, listing_id: str) -> None:
    _pg_execute("delete from public.favorites where user_id = %s and listing_id = %s", (user_id, listing_id))


def list_favorite_ids(user_id: str) -> list[str]:
    rows = _pg_execute("select listing_id from public.favorites where user_id = %s", (user_id,), fetch="all")
    return [str(row["listing_id"]) for row in (rows or [])]


def list_favorites(user_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        f"select {_LISTING_COLUMNS} from public.favorites f join public.listings l on l.id = f.listing_id "
        "left join public.profiles p on p.id = l.seller_id where f.user_id = %s order by f.created_at desc",
        (user_id,),
        fetch="all",
    )
    return [_listing_row(row) for row in (rows or [])]


def _offer_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    for key in ("id", "listing_id", "buyer_id", "seller_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


_OFFER_COLUMNS = (
    "o.id, o.listing_id, o.buyer_id, o.seller_id, o.kind, o.amount, o.message, o.status, o.created_at, o.updated_at, "
    "l.title as listing_title, l.cover_image as listing_cover, l.price as listing_price, "
    "b.full_name as buyer_name, s.full_name as seller_name"
)


def create_offer(listing_id: str, buyer_id: str, seller_id: str, kind: str, amount: int, message: str | None) -> dict[str, Any]:
    row = _pg_execute(
        """
        insert into public.offers (listing_id, buyer_id, seller_id, kind, amount, message)
        values (%s, %s, %s, %s, %s, %s) returning id
        """,
        (listing_id, buyer_id, seller_id, kind, int(amount), message),
        fetch="one",
    )
    return fetch_offer(str(row["id"]))  # type: ignore[index]


def fetch_offer(offer_id: str) -> dict[str, Any] | None:
    row = _pg_execute(
        f"select {_OFFER_COLUMNS} from public.offers o join public.listings l on l.id = o.listing_id "
        "left join public.profiles b on b.id = o.buyer_id left join public.profiles s on s.id = o.seller_id where o.id = %s",
        (offer_id,),
        fetch="one",
    )
    return _offer_row(row)


def list_offers(user_id: str) -> dict[str, list[dict[str, Any]]]:
    received = _pg_execute(
        f"select {_OFFER_COLUMNS} from public.offers o join public.listings l on l.id = o.listing_id "
        "left join public.profiles b on b.id = o.buyer_id left join public.profiles s on s.id = o.seller_id "
        "where o.seller_id = %s order by o.created_at desc",
        (user_id,),
        fetch="all",
    )
    sent = _pg_execute(
        f"select {_OFFER_COLUMNS} from public.offers o join public.listings l on l.id = o.listing_id "
        "left join public.profiles b on b.id = o.buyer_id left join public.profiles s on s.id = o.seller_id "
        "where o.buyer_id = %s order by o.created_at desc",
        (user_id,),
        fetch="all",
    )
    return {
        "received": [_offer_row(row) for row in (received or [])],
        "sent": [_offer_row(row) for row in (sent or [])],
    }


def update_offer_status(offer_id: str, status: str) -> dict[str, Any] | None:
    _pg_execute("update public.offers set status = %s, updated_at = now() where id = %s", (status, offer_id))
    return fetch_offer(offer_id)


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
