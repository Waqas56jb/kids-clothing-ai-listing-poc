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
        # A category "group" icon on the marketplace (e.g. "Tröjor") maps to
        # several canonical categories at once (sweater, hoodie, cardigan, …),
        # sent as a comma-separated list; a single category still works the
        # same as before.
        keys = [c.strip() for c in category.split(",") if c.strip()]
        if keys:
            clauses.append(f"l.category in ({', '.join(['%s'] * len(keys))})")
            params.extend(keys)
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
    from psycopg.types.json import Jsonb

    allowed = {
        "title", "description", "price", "status", "category", "brand", "size", "color", "condition", "gender", "defects",
        "images", "cover_image",
    }
    sets: list[str] = []
    params: list[Any] = []
    for key, value in patch.items():
        if key in allowed:
            sets.append(f"{key} = %s")
            if key == "images":
                params.append(Jsonb(list(value or [])))
            else:
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
    "o.counter_amount, o.counter_message, "
    "l.title as listing_title, l.cover_image as listing_cover, l.price as listing_price, l.status as listing_status, "
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


def update_offer(offer_id: str, **fields: Any) -> dict[str, Any] | None:
    allowed = {"status", "counter_amount", "counter_message", "amount"}
    sets = [f"{key} = %s" for key in fields if key in allowed]
    params: list[Any] = [value for key, value in fields.items() if key in allowed]
    if sets:
        sets.append("updated_at = now()")
        params.append(offer_id)
        _pg_execute(f"update public.offers set {', '.join(sets)} where id = %s", tuple(params))
    return fetch_offer(offer_id)


def accepted_offer_for(listing_id: str, buyer_id: str) -> dict[str, Any] | None:
    row = _pg_execute(
        f"select {_OFFER_COLUMNS} from public.offers o join public.listings l on l.id = o.listing_id "
        "left join public.profiles b on b.id = o.buyer_id left join public.profiles s on s.id = o.seller_id "
        "where o.listing_id = %s and o.buyer_id = %s and o.status = 'accepted' order by o.updated_at desc limit 1",
        (listing_id, buyer_id),
        fetch="one",
    )
    return _offer_row(row)


# ---------------------------------------------------------------------------
# Settings, notifications, push subscriptions
# ---------------------------------------------------------------------------


def get_setting(key: str) -> str | None:
    row = _pg_execute("select value from public.app_settings where key = %s", (key,), fetch="one")
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    _pg_execute(
        "insert into public.app_settings (key, value) values (%s, %s) "
        "on conflict (key) do update set value = excluded.value, updated_at = now()",
        (key, value),
    )


def _notification_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    data["id"] = str(data["id"])
    data["user_id"] = str(data["user_id"])
    data["data"] = dict(data.get("data") or {})
    return data


def insert_notification(user_id: str, kind: str, title: str, body: str, link: str | None, data: dict[str, Any] | None) -> dict[str, Any]:
    from psycopg.types.json import Jsonb

    row = _pg_execute(
        "insert into public.notifications (user_id, kind, title, body, link, data) values (%s, %s, %s, %s, %s, %s) returning *",
        (user_id, kind, title, body, link, Jsonb(data or {})),
        fetch="one",
    )
    return _notification_row(row)  # type: ignore[return-value]


def list_notifications(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = _pg_execute(
        "select * from public.notifications where user_id = %s order by created_at desc limit %s",
        (user_id, int(limit)),
        fetch="all",
    )
    return [_notification_row(row) for row in (rows or [])]


def unread_notification_count(user_id: str) -> int:
    row = _pg_execute(
        "select count(*) as count from public.notifications where user_id = %s and read_at is null",
        (user_id,),
        fetch="one",
    )
    return int((row or {}).get("count") or 0)


def mark_notifications_read(user_id: str, ids: list[str] | None = None) -> None:
    if ids:
        _pg_execute(
            "update public.notifications set read_at = now() where user_id = %s and read_at is null and id = any(%s::uuid[])",
            (user_id, ids),
        )
    else:
        _pg_execute("update public.notifications set read_at = now() where user_id = %s and read_at is null", (user_id,))


def upsert_push_subscription(user_id: str, endpoint: str, p256dh: str, auth: str) -> None:
    _pg_execute(
        "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%s, %s, %s, %s) "
        "on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
        (user_id, endpoint, p256dh, auth),
    )


def delete_push_subscription(endpoint: str, user_id: str | None = None) -> None:
    if user_id:
        _pg_execute("delete from public.push_subscriptions where endpoint = %s and user_id = %s", (endpoint, user_id))
    else:
        _pg_execute("delete from public.push_subscriptions where endpoint = %s", (endpoint,))


def list_push_subscriptions(user_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute("select endpoint, p256dh, auth from public.push_subscriptions where user_id = %s", (user_id,), fetch="all")
    return [dict(row) for row in (rows or [])]


# ---------------------------------------------------------------------------
# Messages about a listing
# ---------------------------------------------------------------------------

_MESSAGE_COLUMNS = (
    "m.id, m.listing_id, m.sender_id, m.recipient_id, m.body, m.read_at, m.created_at, "
    "s.full_name as sender_name, r.full_name as recipient_name, l.title as listing_title, l.cover_image as listing_cover"
)


def _message_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    for key in ("id", "listing_id", "sender_id", "recipient_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


def insert_message(listing_id: str, sender_id: str, recipient_id: str, body: str) -> dict[str, Any]:
    row = _pg_execute(
        "insert into public.messages (listing_id, sender_id, recipient_id, body) values (%s, %s, %s, %s) returning id",
        (listing_id, sender_id, recipient_id, body),
        fetch="one",
    )
    return fetch_message(str(row["id"]))  # type: ignore[index]


def fetch_message(message_id: str) -> dict[str, Any] | None:
    row = _pg_execute(
        f"select {_MESSAGE_COLUMNS} from public.messages m join public.listings l on l.id = m.listing_id "
        "left join public.profiles s on s.id = m.sender_id left join public.profiles r on r.id = m.recipient_id where m.id = %s",
        (message_id,),
        fetch="one",
    )
    return _message_row(row)


def list_threads(user_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        """
        with mine as (
          select m.*, case when m.sender_id = %s then m.recipient_id else m.sender_id end as other_id
          from public.messages m where m.sender_id = %s or m.recipient_id = %s
        ),
        latest as (
          select distinct on (listing_id, other_id) listing_id, other_id, body, created_at, sender_id
          from mine order by listing_id, other_id, created_at desc
        )
        select latest.listing_id, latest.other_id, latest.body as last_body, latest.created_at as last_at,
               latest.sender_id as last_sender_id,
               p.full_name as other_name, l.title as listing_title, l.cover_image as listing_cover, l.seller_id as listing_seller_id,
               (select count(*) from public.messages u where u.listing_id = latest.listing_id and u.sender_id = latest.other_id
                  and u.recipient_id = %s and u.read_at is null) as unread
        from latest
        join public.listings l on l.id = latest.listing_id
        left join public.profiles p on p.id = latest.other_id
        order by latest.created_at desc
        """,
        (user_id, user_id, user_id, user_id),
        fetch="all",
    )
    threads = []
    for row in rows or []:
        data = dict(row)
        for key in ("listing_id", "other_id", "last_sender_id", "listing_seller_id"):
            if data.get(key) is not None:
                data[key] = str(data[key])
        data["unread"] = int(data.get("unread") or 0)
        threads.append(data)
    return threads


def list_conversation(user_id: str, listing_id: str, other_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        f"select {_MESSAGE_COLUMNS} from public.messages m join public.listings l on l.id = m.listing_id "
        "left join public.profiles s on s.id = m.sender_id left join public.profiles r on r.id = m.recipient_id "
        "where m.listing_id = %s and ((m.sender_id = %s and m.recipient_id = %s) or (m.sender_id = %s and m.recipient_id = %s)) "
        "order by m.created_at asc",
        (listing_id, user_id, other_id, other_id, user_id),
        fetch="all",
    )
    return [_message_row(row) for row in (rows or [])]


def mark_messages_read(user_id: str, listing_id: str, other_id: str) -> None:
    _pg_execute(
        "update public.messages set read_at = now() where listing_id = %s and recipient_id = %s and sender_id = %s and read_at is null",
        (listing_id, user_id, other_id),
    )


def unread_message_count(user_id: str) -> int:
    row = _pg_execute(
        "select count(*) as count from public.messages where recipient_id = %s and read_at is null",
        (user_id,),
        fetch="one",
    )
    return int((row or {}).get("count") or 0)


# ---------------------------------------------------------------------------
# Cart + orders
# ---------------------------------------------------------------------------


def list_cart(user_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        f"select {_LISTING_COLUMNS}, c.price as cart_price, c.offer_id, c.added_at from public.cart_items c "
        "join public.listings l on l.id = c.listing_id left join public.profiles p on p.id = l.seller_id "
        "where c.user_id = %s order by c.added_at desc",
        (user_id,),
        fetch="all",
    )
    items = []
    for row in rows or []:
        data = _listing_row(row) or {}
        data["cart_price"] = int(row.get("cart_price") or 0)
        data["offer_id"] = str(row["offer_id"]) if row.get("offer_id") else None
        items.append(data)
    return items


def add_cart_item(user_id: str, listing_id: str, price: int, offer_id: str | None = None) -> None:
    _pg_execute(
        "insert into public.cart_items (user_id, listing_id, price, offer_id) values (%s, %s, %s, %s) "
        "on conflict (user_id, listing_id) do update set price = excluded.price, offer_id = coalesce(excluded.offer_id, public.cart_items.offer_id)",
        (user_id, listing_id, int(price), offer_id),
    )


def remove_cart_item(user_id: str, listing_id: str) -> None:
    _pg_execute("delete from public.cart_items where user_id = %s and listing_id = %s", (user_id, listing_id))


def clear_cart(user_id: str) -> None:
    _pg_execute("delete from public.cart_items where user_id = %s", (user_id,))


def cart_count(user_id: str) -> int:
    row = _pg_execute("select count(*) as count from public.cart_items where user_id = %s", (user_id,), fetch="one")
    return int((row or {}).get("count") or 0)


def _order_item_row(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "order_id", "listing_id", "seller_id", "offer_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


def _order_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    data["id"] = str(data["id"])
    if data.get("buyer_id") is not None:
        data["buyer_id"] = str(data["buyer_id"])
    data["shipping"] = dict(data.get("shipping") or {})
    return data


def create_order(buyer_id: str, items: list[dict[str, Any]], shipping: dict[str, Any], total: int, payment_provider: str) -> dict[str, Any]:
    from psycopg.types.json import Jsonb

    order = _pg_execute(
        "insert into public.orders (buyer_id, total, shipping, payment_provider) values (%s, %s, %s, %s) returning id",
        (buyer_id, int(total), Jsonb(shipping), payment_provider),
        fetch="one",
    )
    order_id = str(order["id"])  # type: ignore[index]
    for item in items:
        _pg_execute(
            "insert into public.order_items (order_id, listing_id, seller_id, offer_id, title, price, cover_image) "
            "values (%s, %s, %s, %s, %s, %s, %s)",
            (order_id, item["listing_id"], item.get("seller_id"), item.get("offer_id"), item["title"], int(item["price"]), item.get("cover_image")),
        )
    return fetch_order(order_id)  # type: ignore[return-value]


def fetch_order(order_id: str) -> dict[str, Any] | None:
    row = _pg_execute(
        "select o.*, b.full_name as buyer_name, b.email as buyer_email from public.orders o "
        "left join public.profiles b on b.id = o.buyer_id where o.id = %s",
        (order_id,),
        fetch="one",
    )
    order = _order_row(row)
    if not order:
        return None
    items = _pg_execute(
        "select i.*, s.full_name as seller_name from public.order_items i left join public.profiles s on s.id = i.seller_id "
        "where i.order_id = %s order by i.created_at asc",
        (order_id,),
        fetch="all",
    )
    order["items"] = [_order_item_row(item) for item in (items or [])]
    return order


def update_order(order_id: str, **fields: Any) -> dict[str, Any] | None:
    allowed = {"status", "payment_ref", "paid_at", "payment_provider", "stripe_payment_intent_id", "refunded_amount"}
    sets = [f"{key} = %s" for key in fields if key in allowed]
    params: list[Any] = [value for key, value in fields.items() if key in allowed]
    if sets:
        params.append(order_id)
        _pg_execute(f"update public.orders set {', '.join(sets)} where id = %s", tuple(params))
    return fetch_order(order_id)


def update_order_items_status(order_id: str, status: str) -> None:
    _pg_execute("update public.order_items set status = %s, updated_at = now() where order_id = %s", (status, order_id))


def update_order_item(item_id: str, status: str) -> dict[str, Any] | None:
    _pg_execute("update public.order_items set status = %s, updated_at = now() where id = %s", (status, item_id))
    row = _pg_execute("select * from public.order_items where id = %s", (item_id,), fetch="one")
    return _order_item_row(row) if row else None


def list_orders(user_id: str) -> dict[str, list[dict[str, Any]]]:
    purchase_rows = _pg_execute(
        "select id from public.orders where buyer_id = %s order by created_at desc", (user_id,), fetch="all"
    )
    purchases = [fetch_order(str(row["id"])) for row in (purchase_rows or [])]
    sale_rows = _pg_execute(
        "select distinct order_id from public.order_items where seller_id = %s", (user_id,), fetch="all"
    )
    sales = []
    for row in sale_rows or []:
        order = fetch_order(str(row["order_id"]))
        if not order or order.get("status") == "pending_payment":
            continue
        order["items"] = [item for item in order["items"] if item.get("seller_id") == user_id]
        sales.append(order)
    sales.sort(key=lambda o: str(o.get("created_at")), reverse=True)
    return {"purchases": [p for p in purchases if p], "sales": sales}


# ---------------------------------------------------------------------------
# Stripe Connect: seller payout accounts, transfers, refunds, webhooks
# ---------------------------------------------------------------------------


def set_seller_stripe_account(user_id: str, account_id: str) -> None:
    _pg_execute("update public.profiles set stripe_account_id = %s where id = %s", (account_id, user_id))


def update_seller_stripe_status(
    account_id: str, *, charges_enabled: bool, payouts_enabled: bool, details_submitted: bool
) -> dict[str, Any] | None:
    row = _pg_execute(
        "update public.profiles set stripe_charges_enabled = %s, stripe_payouts_enabled = %s, "
        "stripe_details_submitted = %s, stripe_onboarding_updated_at = now() "
        "where stripe_account_id = %s returning *",
        (charges_enabled, payouts_enabled, details_submitted, account_id),
        fetch="one",
    )
    return dict(row) if row else None


def update_order_item_payout(item_id: str, **fields: Any) -> None:
    allowed = {"commission_percent", "commission_amount", "seller_amount", "stripe_transfer_id", "transfer_status", "refunded_amount"}
    sets = [f"{key} = %s" for key in fields if key in allowed]
    params: list[Any] = [value for key, value in fields.items() if key in allowed]
    if not sets:
        return
    params.append(item_id)
    _pg_execute(f"update public.order_items set {', '.join(sets)}, updated_at = now() where id = %s", tuple(params))


def list_pending_onboarding_transfers(seller_id: str) -> list[dict[str, Any]]:
    rows = _pg_execute(
        "select * from public.order_items where seller_id = %s and transfer_status = 'pending_onboarding'",
        (seller_id,),
        fetch="all",
    )
    return [_order_item_row(row) for row in (rows or [])]


def mark_transfer_reversed(stripe_transfer_id: str) -> None:
    _pg_execute(
        "update public.order_items set transfer_status = 'reversed', updated_at = now() where stripe_transfer_id = %s",
        (stripe_transfer_id,),
    )


def create_refund(order_id: str, order_item_id: str, amount: int, reason: str | None, created_by: str) -> dict[str, Any]:
    row = _pg_execute(
        "insert into public.refunds (order_id, order_item_id, amount, reason, created_by) "
        "values (%s, %s, %s, %s, %s) returning *",
        (order_id, order_item_id, int(amount), reason, created_by),
        fetch="one",
    )
    return dict(row)  # type: ignore[arg-type]


def update_refund(refund_id: str, **fields: Any) -> dict[str, Any] | None:
    allowed = {"status", "stripe_refund_id", "stripe_transfer_reversal_id"}
    sets = [f"{key} = %s" for key in fields if key in allowed]
    params: list[Any] = [value for key, value in fields.items() if key in allowed]
    if sets:
        params.append(refund_id)
        _pg_execute(f"update public.refunds set {', '.join(sets)}, updated_at = now() where id = %s", tuple(params))
    row = _pg_execute("select * from public.refunds where id = %s", (refund_id,), fetch="one")
    return dict(row) if row else None


def recompute_order_refund_status(order_id: str) -> None:
    items = _pg_execute("select status from public.order_items where order_id = %s", (order_id,), fetch="all") or []
    if not items:
        return
    statuses = {row["status"] for row in items}
    if statuses == {"refunded"}:
        new_status = "refunded"
    elif "refunded" in statuses:
        new_status = "partially_refunded"
    else:
        return  # nothing refunded yet -- leave the order's own status alone
    total_refunded = _pg_execute(
        "select coalesce(sum(refunded_amount), 0) as total from public.order_items where order_id = %s",
        (order_id,),
        fetch="one",
    )
    _pg_execute(
        "update public.orders set status = %s, refunded_amount = %s where id = %s",
        (new_status, int((total_refunded or {}).get("total") or 0), order_id),
    )


def sync_order_refund_from_stripe(payment_intent_id: str, amount_refunded_minor: int) -> None:
    """Reconcile a refund made directly in the Stripe Dashboard (bypassing
    our own refund_order_item) so `orders.refunded_amount` never drifts from
    what Stripe actually refunded."""
    row = _pg_execute(
        "select id, total from public.orders where stripe_payment_intent_id = %s", (payment_intent_id,), fetch="one"
    )
    if not row:
        return
    order_id = str(row["id"])
    refunded = amount_refunded_minor // 100
    status = "refunded" if refunded >= int(row["total"]) else "partially_refunded" if refunded > 0 else None
    if status:
        _pg_execute("update public.orders set status = %s, refunded_amount = %s where id = %s", (status, refunded, order_id))


def is_webhook_event_processed(event_id: str) -> bool:
    row = _pg_execute("select 1 from public.stripe_webhook_events where id = %s", (event_id,), fetch="one")
    return row is not None


def mark_webhook_event_processed(event_id: str, event_type: str) -> None:
    # Recorded only *after* handling succeeds, deliberately -- if we marked
    # it first and the handler then failed partway (a transient DB hiccup, a
    # Stripe API blip), Stripe's retry would see a "done" row and never try
    # again, silently dropping a payment confirmation or a refund. A narrow
    # race between two truly-simultaneous deliveries of the same event is an
    # acceptable trade for that: every handler below (complete_order,
    # transfer_for_paid_order, update_order_item_payout, ...) is already
    # safe to run twice on its own.
    _pg_execute(
        "insert into public.stripe_webhook_events (id, type) values (%s, %s) on conflict (id) do nothing",
        (event_id, event_type),
    )


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
