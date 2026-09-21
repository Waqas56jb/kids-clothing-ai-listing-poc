"""Stripe Connect marketplace payouts: seller onboarding, commission split,
transfers and refunds.

Architecture: **separate charges and transfers**, not destination charges.
A buyer's cart routinely holds items from more than one seller, and a single
Stripe Checkout Session only supports one `transfer_data.destination` -- so
the buyer's payment goes to Miniplagg's own platform Stripe account exactly
like it does today (see commerce.py), and once that payment is confirmed
this module moves each seller's own cut to their *connected* Stripe account
with a separate `Transfer`, one per seller per order. Whatever is left in
the platform account after every transfer is Miniplagg's commission -- it
is never moved anywhere, so there is nothing to "collect" separately.

Every Stripe call that creates or moves money is idempotency-keyed off our
own row ids, so a retried webhook delivery, a retried request, or us
re-running a backfill can never double-create a transfer or a refund.

Nothing in this module runs unless STRIPE_SECRET_KEY is set (see
commerce.stripe_enabled()) -- deploying this code changes no behaviour on
an environment that has not configured Stripe.
"""
from __future__ import annotations

import os
from typing import Any

from app import commerce, db, notifications

# Placeholder default -- Miniplagg's own business decision, not ours. Set
# PLATFORM_COMMISSION_PERCENT in the environment to the agreed rate before
# going live; nothing here breaks if it changes, it only affects the split
# computed for orders placed after the change (existing orders keep the
# commission_percent they were actually charged at, recorded per line item).
PLATFORM_COMMISSION_PERCENT = float(os.getenv("PLATFORM_COMMISSION_PERCENT") or "10")

STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
STRIPE_CONNECT_REFRESH_URL = f"{commerce.FRONTEND_URL}/utbetalningar?refresh=1"
STRIPE_CONNECT_RETURN_URL = f"{commerce.FRONTEND_URL}/utbetalningar?klar=1"


class ConnectError(ValueError):
    pass


def _stripe():
    if not commerce.stripe_enabled():
        raise ConnectError("Stripe är inte konfigurerat.")
    import stripe

    stripe.api_key = commerce.STRIPE_SECRET_KEY
    return stripe


def webhooks_enabled() -> bool:
    return bool(STRIPE_WEBHOOK_SECRET)


def commission_split(amount: int, percent: float | None = None) -> tuple[int, int]:
    """(commission, seller_amount) for a gross `amount` in whole kronor.
    Commission always rounds in the platform's favour by at most one öre-
    equivalent unit; the two numbers always sum back to `amount` exactly."""
    rate = PLATFORM_COMMISSION_PERCENT if percent is None else percent
    commission = round(amount * rate / 100)
    commission = max(0, min(amount, commission))
    return commission, amount - commission


# ---------------------------------------------------------------------------
# Seller onboarding
# ---------------------------------------------------------------------------


def get_or_create_account(user: dict[str, Any]) -> str:
    """Return this seller's Stripe Express account id, creating one on
    Stripe (and recording it) the first time they start onboarding."""
    stripe = _stripe()
    existing = user.get("stripe_account_id")
    if existing:
        return existing
    account = stripe.Account.create(
        type="express",
        country="SE",
        email=user.get("email"),
        capabilities={"transfers": {"requested": True}, "card_payments": {"requested": True}},
        business_type="individual",
        metadata={"miniplagg_user_id": user["id"]},
        idempotency_key=f"connect-account:{user['id']}",
    )
    db.set_seller_stripe_account(user["id"], account.id)
    return account.id


def create_onboarding_link(user: dict[str, Any]) -> str:
    stripe = _stripe()
    account_id = get_or_create_account(user)
    link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=STRIPE_CONNECT_REFRESH_URL,
        return_url=STRIPE_CONNECT_RETURN_URL,
        type="account_onboarding",
    )
    return link.url


def sync_account_status(account_id: str) -> dict[str, Any] | None:
    """Pull the connected account's current capability flags from Stripe and
    persist them -- called both right after onboarding returns and from the
    `account.updated` webhook, so status is never stuck stale."""
    stripe = _stripe()
    account = stripe.Account.retrieve(account_id)
    profile = db.update_seller_stripe_status(
        account_id,
        charges_enabled=bool(account.get("charges_enabled")),
        payouts_enabled=bool(account.get("payouts_enabled")),
        details_submitted=bool(account.get("details_submitted")),
    )
    if profile and account.get("payouts_enabled"):
        _retry_pending_transfers(profile["id"])
    return profile


def account_status(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "connected": bool(user.get("stripe_account_id")),
        "charges_enabled": bool(user.get("stripe_charges_enabled")),
        "payouts_enabled": bool(user.get("stripe_payouts_enabled")),
        "details_submitted": bool(user.get("stripe_details_submitted")),
        "commission_percent": PLATFORM_COMMISSION_PERCENT,
    }


# ---------------------------------------------------------------------------
# Transfers (seller payouts) -- run once an order is paid
# ---------------------------------------------------------------------------


def transfer_for_paid_order(order: dict[str, Any]) -> None:
    """Split a just-paid order's total among its sellers. Safe to call more
    than once for the same order (e.g. a webhook retry racing the buyer's
    own return-URL confirmation) -- every item is only ever transferred
    once, tracked by `order_items.transfer_status`."""
    if order.get("payment_provider") != "stripe" or not commerce.stripe_enabled():
        return
    for item in order.get("items", []):
        if item.get("transfer_status") in ("transferred", "pending"):
            continue
        _transfer_item(order, item)


def _transfer_item(order: dict[str, Any], item: dict[str, Any]) -> None:
    seller_id = item.get("seller_id")
    if not seller_id:
        return
    seller = db.fetch_profile(seller_id)
    commission, seller_amount = commission_split(int(item["price"]))
    db.update_order_item_payout(item["id"], commission_percent=PLATFORM_COMMISSION_PERCENT, commission_amount=commission, seller_amount=seller_amount)

    account_id = (seller or {}).get("stripe_account_id")
    if not account_id or not (seller or {}).get("stripe_payouts_enabled"):
        db.update_order_item_payout(item["id"], transfer_status="pending_onboarding")
        return

    stripe = _stripe()
    try:
        transfer = stripe.Transfer.create(
            amount=seller_amount * 100,
            currency=(order.get("currency") or "sek").lower(),
            destination=account_id,
            transfer_group=f"order:{order['id']}",
            metadata={"order_id": order["id"], "order_item_id": item["id"]},
            idempotency_key=f"transfer:{item['id']}",
        )
    except Exception as exc:  # noqa: BLE001 -- never let a payout failure break order completion
        print(f"[stripe_connect] transfer failed for order_item {item['id']}: {exc}")
        db.update_order_item_payout(item["id"], transfer_status="failed")
        return
    db.update_order_item_payout(item["id"], transfer_status="transferred", stripe_transfer_id=transfer.id)


def _retry_pending_transfers(seller_id: str) -> None:
    """Called once a seller finishes onboarding -- pay out everything that
    was sold before they connected their account."""
    for item in db.list_pending_onboarding_transfers(seller_id):
        order = db.fetch_order(item["order_id"])
        if order:
            _transfer_item(order, item)


# ---------------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------------


def refund_order_item(order_id: str, item_id: str, actor_id: str, reason: str | None = None) -> dict[str, Any]:
    order = db.fetch_order(order_id)
    if not order:
        raise ConnectError("Ordern hittades inte.")
    item = next((i for i in order["items"] if i["id"] == item_id), None)
    if not item:
        raise ConnectError("Plagget hittades inte i ordern.")
    if item.get("status") == "refunded":
        raise ConnectError("Det här plagget är redan återbetalat.")
    if order.get("payment_provider") != "stripe":
        raise ConnectError("Testbetalningar återbetalas inte via Stripe -- markera ordern manuellt.")

    amount = int(item["price"])
    refund_row = db.create_refund(order_id, item_id, amount, reason, actor_id)
    stripe = _stripe()
    try:
        refund = stripe.Refund.create(
            payment_intent=order.get("stripe_payment_intent_id"),
            amount=amount * 100,
            reason="requested_by_customer",
            metadata={"order_id": order_id, "order_item_id": item_id},
            idempotency_key=f"refund:{item_id}",
        )
    except Exception as exc:  # noqa: BLE001
        db.update_refund(refund_row["id"], status="failed")
        raise ConnectError(f"Återbetalningen misslyckades: {exc}") from exc

    reversal_id = None
    if item.get("stripe_transfer_id"):
        # A separate Transfer, unlike a destination charge, is never
        # automatically clawed back by refunding the charge -- it has to be
        # reversed explicitly, or the seller keeps money for an item the
        # buyer no longer paid for.
        try:
            reversal = stripe.Transfer.create_reversal(
                item["stripe_transfer_id"],
                amount=int(item.get("seller_amount") or 0) * 100,
                idempotency_key=f"reversal:{item_id}",
            )
            reversal_id = reversal.id
        except Exception as exc:  # noqa: BLE001 -- refund to the buyer still succeeded; log and move on
            print(f"[stripe_connect] transfer reversal failed for order_item {item_id}: {exc}")

    db.update_refund(refund_row["id"], status="succeeded", stripe_refund_id=refund.id, stripe_transfer_reversal_id=reversal_id)
    db.update_order_item(item_id, "refunded")
    db.update_order_item_payout(item_id, refunded_amount=amount, transfer_status="reversed" if reversal_id else item.get("transfer_status"))
    db.recompute_order_refund_status(order_id)
    if item.get("listing_id"):
        db.update_listing(item["listing_id"], {"status": "published"})

    notifications.notify(
        order.get("buyer_id"),
        "refund",
        f"”{item['title']}” har återbetalats",
        f"{amount} kr har återbetalats till ditt betalkort.",
        link=f"/kassa/klart/{order_id}",
        data={"order_id": order_id},
    )
    return db.fetch_order(order_id) or order


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------


def verify_webhook(payload: bytes, signature: str | None) -> Any:
    stripe = _stripe()
    if not STRIPE_WEBHOOK_SECRET:
        raise ConnectError("STRIPE_WEBHOOK_SECRET är inte konfigurerat.")
    return stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)


def handle_webhook_event(event: Any) -> None:
    """Skips an event already marked done; otherwise processes it and only
    marks it done on success, so a genuinely failed delivery still gets
    retried by Stripe instead of being silently swallowed (see
    db.mark_webhook_event_processed for why that ordering matters)."""
    event_id = event["id"] if isinstance(event, dict) else event.id
    event_type = event["type"] if isinstance(event, dict) else event.type
    if db.is_webhook_event_processed(event_id):
        return

    data = (event["data"]["object"] if isinstance(event, dict) else event.data.object) or {}

    if event_type == "checkout.session.completed":
        order_id = (data.get("metadata") or {}).get("order_id")
        if order_id and data.get("payment_status") == "paid":
            order = commerce.complete_order(order_id, payment_ref=data.get("payment_intent") or data.get("id"))
            if data.get("payment_intent"):
                db.update_order(order_id, stripe_payment_intent_id=data["payment_intent"])
                order = db.fetch_order(order_id) or order
            transfer_for_paid_order(order)

    elif event_type == "payment_intent.payment_failed":
        order_id = (data.get("metadata") or {}).get("order_id")
        if order_id:
            order = db.fetch_order(order_id)
            if order and order.get("status") == "pending_payment":
                db.update_order(order_id, status="payment_failed")
                notifications.notify(
                    order.get("buyer_id"),
                    "payment_failed",
                    "Betalningen misslyckades",
                    "Din betalning kunde inte genomföras. Du kan försöka igen från din varukorg.",
                    link="/varukorg",
                    data={"order_id": order_id},
                )

    elif event_type == "account.updated":
        account_id = data.get("id")
        if account_id:
            sync_account_status(account_id)

    elif event_type in ("transfer.reversed",):
        transfer_id = data.get("id")
        if transfer_id:
            db.mark_transfer_reversed(transfer_id)

    elif event_type == "charge.refunded":
        # Refunds we initiate ourselves are already recorded synchronously
        # in refund_order_item(); this only catches a refund made directly
        # in the Stripe Dashboard so our own records don't drift from it.
        payment_intent_id = data.get("payment_intent")
        if payment_intent_id:
            db.sync_order_refund_from_stripe(payment_intent_id, int(data.get("amount_refunded") or 0))

    db.mark_webhook_event_processed(event_id, event_type)
