"""In-app notifications + Web Push (mobile/desktop) for Miniplagg users.

Every event that matters to a seller or buyer (a purchase, an offer, a
counter-offer, an accepted/declined offer, a message, a shipped order) is
stored as a notification row so it shows up inside the app, and is also
pushed to every browser/phone that subscribed via the service worker.

Web Push needs a VAPID key pair. Instead of demanding manual server setup,
the pair is generated once on first use and kept in `app_settings`, so push
works out of the box; set VAPID_PRIVATE_PEM / VAPID_SUBJECT to override.
"""
from __future__ import annotations

import base64
import json
import os
import threading
from typing import Any

from app import db

VAPID_SUBJECT = os.getenv("VAPID_SUBJECT") or "mailto:hej@miniplagg.com"
_SETTING_PRIVATE = "vapid_private_pem"
_SETTING_PUBLIC = "vapid_public_key"
_lock = threading.Lock()
_cache: dict[str, str] = {}

KIND_LABELS = {
    "purchase": "Köp",
    "sale": "Försäljning",
    "offer": "Bud",
    "counteroffer": "Motbud",
    "offer_accepted": "Bud accepterat",
    "offer_declined": "Bud avböjt",
    "message": "Meddelande",
    "order_shipped": "Skickat",
}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _ensure_vapid() -> tuple[str, str] | None:
    """Return (private_pem, public_key_b64url) or None when push is unavailable."""
    if _cache.get("private") and _cache.get("public"):
        return _cache["private"], _cache["public"]
    with _lock:
        if _cache.get("private") and _cache.get("public"):
            return _cache["private"], _cache["public"]
        try:
            from cryptography.hazmat.primitives import serialization
            from py_vapid import Vapid
        except Exception:  # noqa: BLE001 -- dependency missing: in-app only
            return None
        try:
            private_pem = os.getenv("VAPID_PRIVATE_PEM") or db.get_setting(_SETTING_PRIVATE)
            if private_pem:
                vapid = Vapid.from_pem(private_pem.encode("utf-8"))
            else:
                vapid = Vapid()
                vapid.generate_keys()
                private_pem = vapid.private_key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                ).decode("utf-8")
                db.set_setting(_SETTING_PRIVATE, private_pem)
            public_raw = vapid.public_key.public_bytes(
                serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
            )
            public_key = _b64url(public_raw)
            if db.get_setting(_SETTING_PUBLIC) != public_key:
                db.set_setting(_SETTING_PUBLIC, public_key)
            _cache["private"], _cache["public"] = private_pem, public_key
            return private_pem, public_key
        except Exception as exc:  # noqa: BLE001
            print(f"[push] VAPID setup failed: {exc}")
            return None


def public_key() -> str | None:
    keys = _ensure_vapid()
    return keys[1] if keys else None


def push_available() -> bool:
    return _ensure_vapid() is not None


def _send_push(user_id: str, payload: dict[str, Any]) -> None:
    keys = _ensure_vapid()
    if not keys:
        return
    private_pem, _public = keys
    try:
        from py_vapid import Vapid
        from pywebpush import WebPushException, webpush
    except Exception:  # noqa: BLE001
        return
    try:
        subscriptions = db.list_push_subscriptions(user_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[push] could not load subscriptions: {exc}")
        return
    vapid = Vapid.from_pem(private_pem.encode("utf-8"))
    body = json.dumps(payload, ensure_ascii=False)
    for sub in subscriptions:
        info = {"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}}
        try:
            webpush(
                subscription_info=info,
                data=body,
                vapid_private_key=vapid,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=60 * 60 * 24,
            )
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                # The browser unsubscribed / the endpoint is dead: forget it.
                try:
                    db.delete_push_subscription(sub["endpoint"])
                except Exception:  # noqa: BLE001
                    pass
            else:
                print(f"[push] send failed: {exc}")
        except Exception as exc:  # noqa: BLE001
            print(f"[push] send failed: {exc}")


def notify(
    user_id: str | None,
    kind: str,
    title: str,
    body: str = "",
    link: str | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Store an in-app notification and push it to the user's devices.

    Never raises -- a notification failure must not break the action that
    triggered it (a purchase, an offer, ...)."""
    if not user_id or not db.postgres_enabled():
        return None
    try:
        row = db.insert_notification(user_id, kind, title, body, link, data)
    except Exception as exc:  # noqa: BLE001
        print(f"[notify] insert failed: {exc}")
        return None
    payload = {"title": title, "body": body, "link": link or "/notiser", "kind": kind, "id": row["id"]}
    threading.Thread(target=_send_push, args=(user_id, payload), daemon=True).start()
    return row
