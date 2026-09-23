"""Cart, checkout, payment and orders.

Payment runs through Stripe Checkout when STRIPE_SECRET_KEY is configured.
Without it the checkout uses a built-in test payment step (clearly labelled
in the UI) so the whole purchase flow -- cart, shipping, confirmation,
buyer/seller notifications, order history -- works end to end today and
only the payment provider needs plugging in later.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from app import db, notifications

FRONTEND_URL = (os.getenv("FRONTEND_URL") or "https://miniplagg.com").rstrip("/")
STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()

SHIPPING_FIELDS = ("name", "email", "phone", "address", "postal_code", "city")


class CheckoutError(ValueError):
    pass


def stripe_enabled() -> bool:
    return bool(STRIPE_SECRET_KEY)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def cart_price_for(user_id: str, listing: dict[str, Any]) -> tuple[int, str | None]:
    """The price this buyer pays: an accepted offer wins over the list price."""
    offer = db.accepted_offer_for(listing["id"], user_id)
    if offer:
        # `amount` is updated to the agreed figure when an offer (or a
        # counter-offer) is accepted, so it is always the price to charge.
        return int(offer.get("amount") or listing.get("price") or 0), offer["id"]
    return int(listing.get("price") or 0), None


def listing_available_for(user_id: str, listing: dict[str, Any]) -> bool:
    if listing.get("seller_id") == user_id:
        return False
    if listing.get("status") == "published":
        return True
    if listing.get("status") == "reserved":
        return db.accepted_offer_for(listing["id"], user_id) is not None
    return False


def validate_shipping(shipping: dict[str, Any]) -> dict[str, str]:
    clean = {key: str(shipping.get(key) or "").strip() for key in SHIPPING_FIELDS}
    missing = [key for key in ("name", "email", "address", "postal_code", "city") if not clean[key]]
    if missing:
        raise CheckoutError("Fyll i namn, e-post, adress, postnummer och ort.")
    if "@" not in clean["email"]:
        raise CheckoutError("Ange en giltig e-postadress.")
    return clean


def start_checkout(user: dict[str, Any], shipping: dict[str, Any], payment_method: str) -> dict[str, Any]:
    cart = db.list_cart(user["id"])
    if not cart:
        raise CheckoutError("Din varukorg är tom.")
    clean_shipping = validate_shipping(shipping)

    items: list[dict[str, Any]] = []
    for entry in cart:
        listing = db.fetch_listing(entry["id"])
        if not listing or not listing_available_for(user["id"], listing):
            raise CheckoutError(f"”{entry.get('title')}” är inte längre tillgänglig.")
        price, offer_id = cart_price_for(user["id"], listing)
        items.append(
            {
                "listing_id": listing["id"],
                "seller_id": listing.get("seller_id"),
                "offer_id": offer_id or entry.get("offer_id"),
                "title": listing["title"],
                "price": price,
                "cover_image": listing.get("cover_image"),
            }
        )
    total = sum(item["price"] for item in items)
    provider = "stripe" if (payment_method == "stripe" and stripe_enabled()) else "test"
    order = db.create_order(user["id"], items, clean_shipping, total, provider)

    if provider == "stripe":
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        session = stripe.checkout.Session.create(
            mode="payment",
            customer_email=clean_shipping["email"],
            line_items=[
                {
                    "price_data": {
                        "currency": "sek",
                        "unit_amount": int(item["price"]) * 100,
                        "product_data": {"name": item["title"]},
                    },
                    "quantity": 1,
                }
                for item in items
            ],
            metadata={"order_id": order["id"]},
            success_url=f"{FRONTEND_URL}/kassa/klart/{order['id']}?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/kassa?avbruten=1",
        )
        order = db.update_order(order["id"], payment_ref=session.id) or order
        return {"order": order, "checkout_url": session.url, "provider": "stripe"}

    return {"order": order, "checkout_url": None, "provider": "test"}


def stripe_as_dict(obj: Any) -> dict[str, Any]:
    """stripe-python >= 15 returns typed resources (Account, checkout.Session,
    Event.data.object) that are not dicts: `.get`, `in` and iteration all
    raise. Normalise at the boundary so the rest of the code can stay plain."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    return {}


def confirm_stripe(order: dict[str, Any], session_id: str | None) -> dict[str, Any]:
    if order.get("status") == "paid":
        return order
    if not stripe_enabled():
        raise CheckoutError("Stripe är inte konfigurerat.")
    import stripe

    stripe.api_key = STRIPE_SECRET_KEY
    session = stripe_as_dict(stripe.checkout.Session.retrieve(session_id or order.get("payment_ref") or ""))
    if (session.get("metadata") or {}).get("order_id") != order["id"]:
        raise CheckoutError("Betalningen hör inte till den här ordern.")
    if session.get("payment_status") != "paid":
        raise CheckoutError("Betalningen är inte genomförd än.")
    payment_intent_id = session.get("payment_intent")
    if not isinstance(payment_intent_id, str):
        payment_intent_id = stripe_as_dict(payment_intent_id).get("id")
    if payment_intent_id:
        db.update_order(order["id"], stripe_payment_intent_id=payment_intent_id)
    completed = complete_order(order["id"], payment_ref=payment_intent_id or session.get("id"))

    # The buyer's own return-URL request and Stripe's webhook both race to
    # confirm the same order -- whichever gets here first pays the sellers;
    # transfer_for_paid_order is itself idempotent per order item, so the
    # second caller (webhook or return-URL, in either order) is a no-op.
    from app import stripe_connect

    stripe_connect.transfer_for_paid_order(completed)
    return completed


def complete_order(order_id: str, payment_ref: str | None = None) -> dict[str, Any]:
    """Mark the order paid, sell the listings, notify everyone, empty the cart."""
    order = db.fetch_order(order_id)
    if not order:
        raise CheckoutError("Ordern hittades inte.")
    if order.get("status") == "paid":
        return order
    order = db.update_order(order_id, status="paid", paid_at=_now(), payment_ref=payment_ref or order.get("payment_ref")) or order
    db.update_order_items_status(order_id, "paid")
    order = db.fetch_order(order_id) or order

    buyer_id = order.get("buyer_id")
    buyer_name = (order.get("buyer_name") or "En köpare").split(" ")[0]
    sellers: dict[str, list[dict[str, Any]]] = {}
    for item in order["items"]:
        if item.get("listing_id"):
            db.update_listing(item["listing_id"], {"status": "sold"})
        if item.get("offer_id"):
            try:
                db.update_offer(item["offer_id"], status="completed")
            except Exception:  # noqa: BLE001
                pass
        if item.get("seller_id"):
            sellers.setdefault(item["seller_id"], []).append(item)
    if buyer_id:
        db.clear_cart(buyer_id)

    for seller_id, items in sellers.items():
        titles = ", ".join(f"”{item['title']}”" for item in items)
        amount = sum(int(item["price"]) for item in items)
        notifications.notify(
            seller_id,
            "sale",
            "Du har sålt ett plagg!" if len(items) == 1 else f"Du har sålt {len(items)} plagg!",
            f"{buyer_name} köpte {titles} för {amount} kr. Leveransadress finns under Ordrar.",
            link="/annonser?flik=ordrar",
            data={"order_id": order["id"]},
        )
    notifications.notify(
        buyer_id,
        "purchase",
        "Tack för ditt köp!",
        f"Order {order['id'][:8]} på {order['total']} kr är betald. Säljaren skickar snart.",
        link=f"/kassa/klart/{order['id']}",
        data={"order_id": order["id"]},
    )
    return order
