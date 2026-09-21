"""Tests for the Stripe Connect marketplace payout logic: commission split,
seller onboarding, transfers, refunds and webhook idempotency.

No real Stripe account is available in this environment (live/test API keys
are the client's own to provide), so the `stripe` module itself is replaced
with a small fake that records every call and returns canned objects --
this verifies our own logic (commission math, which API calls are made with
which parameters, DB state transitions, idempotency) precisely and
deterministically, the same way it would need to be tested even with a real
Stripe test account in the loop.
"""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest

from app import stripe_connect


class _Obj(dict):
    """A dict that also allows attribute access, like Stripe's own response
    objects (`resp.id` as well as `resp["id"]`)."""

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def get(self, key, default=None):
        return dict.get(self, key, default)


@pytest.fixture
def fake_stripe(monkeypatch):
    """Install a fake `stripe` module and point commerce/stripe_connect at a
    dummy (non-empty) secret key so `_stripe()` doesn't short-circuit."""
    calls: dict[str, list] = {
        "Account.create": [], "Account.retrieve": [], "AccountLink.create": [],
        "Transfer.create": [], "Transfer.create_reversal": [], "Refund.create": [],
        "Webhook.construct_event": [],
    }

    class FakeAccount:
        @staticmethod
        def create(**kwargs):
            calls["Account.create"].append(kwargs)
            return _Obj(id="acct_fake123")

        @staticmethod
        def retrieve(account_id):
            calls["Account.retrieve"].append(account_id)
            return fake_stripe.account_response

    class FakeAccountLink:
        @staticmethod
        def create(**kwargs):
            calls["AccountLink.create"].append(kwargs)
            return _Obj(url="https://connect.stripe.com/setup/fake")

    class FakeTransfer:
        @staticmethod
        def create(**kwargs):
            calls["Transfer.create"].append(kwargs)
            if fake_stripe.transfer_should_fail:
                raise RuntimeError("stripe down")
            return _Obj(id="tr_fake123")

        @staticmethod
        def create_reversal(transfer_id, **kwargs):
            calls["Transfer.create_reversal"].append((transfer_id, kwargs))
            return _Obj(id="trr_fake123")

    class FakeRefund:
        @staticmethod
        def create(**kwargs):
            calls["Refund.create"].append(kwargs)
            if fake_stripe.refund_should_fail:
                raise RuntimeError("stripe down")
            return _Obj(id="re_fake123")

    class FakeWebhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            calls["Webhook.construct_event"].append((payload, sig, secret))
            if fake_stripe.webhook_should_fail:
                raise ValueError("bad signature")
            return fake_stripe.webhook_event

    fake_module = types.SimpleNamespace(
        Account=FakeAccount, AccountLink=FakeAccountLink, Transfer=FakeTransfer,
        Refund=FakeRefund, Webhook=FakeWebhook, api_key=None,
    )
    monkeypatch.setitem(sys.modules, "stripe", fake_module)
    monkeypatch.setattr(stripe_connect.commerce, "STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr(stripe_connect.commerce, "stripe_enabled", lambda: True)
    monkeypatch.setattr(stripe_connect, "STRIPE_WEBHOOK_SECRET", "whsec_fake")

    fake_stripe.calls = calls
    fake_stripe.module = fake_module
    fake_stripe.account_response = _Obj(charges_enabled=True, payouts_enabled=True, details_submitted=True)
    fake_stripe.transfer_should_fail = False
    fake_stripe.refund_should_fail = False
    fake_stripe.webhook_should_fail = False
    fake_stripe.webhook_event = _Obj(id="evt_1", type="checkout.session.completed", data=_Obj(object=_Obj()))
    return fake_stripe


def _seller(**overrides):
    base = {"id": "seller-1", "email": "seller@example.se", "stripe_account_id": None,
            "stripe_payouts_enabled": False}
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Commission math
# ---------------------------------------------------------------------------

def test_commission_split_uses_configured_percent(monkeypatch):
    monkeypatch.setattr(stripe_connect, "PLATFORM_COMMISSION_PERCENT", 10.0)
    commission, seller_amount = stripe_connect.commission_split(100)
    assert (commission, seller_amount) == (10, 90)
    assert commission + seller_amount == 100


def test_commission_split_always_sums_to_the_original_amount():
    for amount in (1, 2, 3, 7, 33, 99, 1000, 12345):
        for percent in (0, 2.5, 10, 33.33, 100):
            commission, seller_amount = stripe_connect.commission_split(amount, percent)
            assert commission + seller_amount == amount
            assert 0 <= commission <= amount


def test_commission_split_explicit_percent_overrides_default(monkeypatch):
    monkeypatch.setattr(stripe_connect, "PLATFORM_COMMISSION_PERCENT", 10.0)
    commission, seller_amount = stripe_connect.commission_split(200, percent=5)
    assert (commission, seller_amount) == (10, 190)


# ---------------------------------------------------------------------------
# Seller onboarding
# ---------------------------------------------------------------------------

def test_get_or_create_account_creates_once_and_persists_id(fake_stripe, monkeypatch):
    set_calls = []
    monkeypatch.setattr(stripe_connect.db, "set_seller_stripe_account", lambda uid, acct: set_calls.append((uid, acct)))
    account_id = stripe_connect.get_or_create_account(_seller())
    assert account_id == "acct_fake123"
    assert set_calls == [("seller-1", "acct_fake123")]
    assert len(fake_stripe.calls["Account.create"]) == 1
    assert fake_stripe.calls["Account.create"][0]["country"] == "SE"


def test_get_or_create_account_reuses_existing_without_calling_stripe(fake_stripe):
    account_id = stripe_connect.get_or_create_account(_seller(stripe_account_id="acct_existing"))
    assert account_id == "acct_existing"
    assert fake_stripe.calls["Account.create"] == []


def test_create_onboarding_link_returns_stripe_hosted_url(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect.db, "set_seller_stripe_account", lambda *a: None)
    url = stripe_connect.create_onboarding_link(_seller(stripe_account_id="acct_existing"))
    assert url == "https://connect.stripe.com/setup/fake"
    call = fake_stripe.calls["AccountLink.create"][0]
    assert call["account"] == "acct_existing"
    assert call["type"] == "account_onboarding"


def test_sync_account_status_persists_flags_and_retries_pending_transfers(fake_stripe, monkeypatch):
    updated = []
    monkeypatch.setattr(
        stripe_connect.db, "update_seller_stripe_status",
        lambda account_id, **flags: updated.append((account_id, flags)) or {"id": "seller-1", **flags},
    )
    retried = []
    monkeypatch.setattr(stripe_connect, "_retry_pending_transfers", lambda seller_id: retried.append(seller_id))
    stripe_connect.sync_account_status("acct_existing")
    assert updated == [("acct_existing", {"charges_enabled": True, "payouts_enabled": True, "details_submitted": True})]
    assert retried == ["seller-1"]


def test_sync_account_status_does_not_retry_when_payouts_still_disabled(fake_stripe, monkeypatch):
    fake_stripe.account_response = _Obj(charges_enabled=True, payouts_enabled=False, details_submitted=True)
    monkeypatch.setattr(stripe_connect.db, "update_seller_stripe_status", lambda *a, **k: {"id": "seller-1"})
    retried = []
    monkeypatch.setattr(stripe_connect, "_retry_pending_transfers", lambda seller_id: retried.append(seller_id))
    stripe_connect.sync_account_status("acct_existing")
    assert retried == []


# ---------------------------------------------------------------------------
# Transfers (seller payouts)
# ---------------------------------------------------------------------------

def _order(items):
    return {"id": "order-1", "currency": "SEK", "payment_provider": "stripe", "items": items}


def _item(**overrides):
    base = {"id": "item-1", "seller_id": "seller-1", "price": 100, "title": "Testplagg", "transfer_status": "not_applicable"}
    base.update(overrides)
    return base


def test_transfer_skips_non_stripe_orders(fake_stripe):
    order = _order([_item()])
    order["payment_provider"] = "test"
    stripe_connect.transfer_for_paid_order(order)
    assert fake_stripe.calls["Transfer.create"] == []


def test_transfer_skips_items_already_transferred_or_pending(fake_stripe):
    order = _order([_item(transfer_status="transferred"), _item(id="item-2", transfer_status="pending")])
    stripe_connect.transfer_for_paid_order(order)
    assert fake_stripe.calls["Transfer.create"] == []


def test_transfer_queues_as_pending_onboarding_when_seller_not_connected(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect.db, "fetch_profile", lambda sid: _seller())
    payouts = []
    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", lambda item_id, **f: payouts.append((item_id, f)))
    order = _order([_item()])
    stripe_connect.transfer_for_paid_order(order)
    assert fake_stripe.calls["Transfer.create"] == []
    statuses = [f.get("transfer_status") for _id, f in payouts]
    assert "pending_onboarding" in statuses


def test_transfer_creates_a_stripe_transfer_for_the_net_amount_with_idempotency_key(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect, "PLATFORM_COMMISSION_PERCENT", 10.0)
    monkeypatch.setattr(
        stripe_connect.db, "fetch_profile",
        lambda sid: _seller(stripe_account_id="acct_seller", stripe_payouts_enabled=True),
    )
    payouts = []
    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", lambda item_id, **f: payouts.append((item_id, f)))
    order = _order([_item(price=100)])
    stripe_connect.transfer_for_paid_order(order)

    call = fake_stripe.calls["Transfer.create"][0]
    assert call["amount"] == 9000  # 90 kr net of a 10% commission, in öre
    assert call["currency"] == "sek"
    assert call["destination"] == "acct_seller"
    assert call["idempotency_key"] == "transfer:item-1"
    final_status = {k: v for _id, f in payouts for k, v in f.items() if k == "transfer_status"}
    assert payouts[-1][1]["transfer_status"] == "transferred"
    assert payouts[-1][1]["stripe_transfer_id"] == "tr_fake123"
    # Commission is recorded once, before the transfer attempt.
    commission_call = next(f for _id, f in payouts if "commission_amount" in f)
    assert commission_call["commission_amount"] == 10
    assert commission_call["seller_amount"] == 90


def test_transfer_failure_marks_failed_and_does_not_raise(fake_stripe, monkeypatch):
    fake_stripe.transfer_should_fail = True
    monkeypatch.setattr(
        stripe_connect.db, "fetch_profile",
        lambda sid: _seller(stripe_account_id="acct_seller", stripe_payouts_enabled=True),
    )
    payouts = []
    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", lambda item_id, **f: payouts.append((item_id, f)))
    order = _order([_item()])
    stripe_connect.transfer_for_paid_order(order)  # must not raise
    assert payouts[-1][1]["transfer_status"] == "failed"


def test_transfer_is_only_ever_created_once_across_two_calls(fake_stripe, monkeypatch):
    """Simulates the webhook and the buyer's return-URL both calling this
    for the same order -- the second call must see the item's own
    transfer_status has already moved past 'not_applicable'."""
    state = {"transfer_status": "not_applicable"}
    monkeypatch.setattr(
        stripe_connect.db, "fetch_profile",
        lambda sid: _seller(stripe_account_id="acct_seller", stripe_payouts_enabled=True),
    )

    def fake_update(item_id, **fields):
        state.update(fields)

    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", fake_update)
    item = _item()
    order = _order([item])
    stripe_connect.transfer_for_paid_order(order)
    assert len(fake_stripe.calls["Transfer.create"]) == 1

    item["transfer_status"] = state["transfer_status"]  # reflect what the "DB" now holds
    stripe_connect.transfer_for_paid_order(order)
    assert len(fake_stripe.calls["Transfer.create"]) == 1  # unchanged


# ---------------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------------

def test_refund_rejects_already_refunded_item(fake_stripe, monkeypatch):
    order = _order([_item(status="refunded")])
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    with pytest.raises(stripe_connect.ConnectError):
        stripe_connect.refund_order_item("order-1", "item-1", "actor-1")


def test_refund_rejects_non_stripe_orders(fake_stripe, monkeypatch):
    order = _order([_item(status="paid")])
    order["payment_provider"] = "test"
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    with pytest.raises(stripe_connect.ConnectError):
        stripe_connect.refund_order_item("order-1", "item-1", "actor-1")


def test_refund_happy_path_reverses_transfer_and_updates_everything(fake_stripe, monkeypatch):
    order = _order([_item(status="paid", price=100, stripe_transfer_id="tr_fake123", seller_amount=90, listing_id="listing-1")])
    order["stripe_payment_intent_id"] = "pi_fake123"
    order["buyer_id"] = "buyer-1"
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    created_refund = {"id": "refund-row-1"}
    monkeypatch.setattr(stripe_connect.db, "create_refund", lambda *a: created_refund)
    updated_refunds = []
    monkeypatch.setattr(stripe_connect.db, "update_refund", lambda rid, **f: updated_refunds.append((rid, f)))
    item_updates = []
    monkeypatch.setattr(stripe_connect.db, "update_order_item", lambda item_id, status: item_updates.append((item_id, status)))
    payout_updates = []
    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", lambda item_id, **f: payout_updates.append((item_id, f)))
    recomputed = []
    monkeypatch.setattr(stripe_connect.db, "recompute_order_refund_status", lambda oid: recomputed.append(oid))
    listing_updates = []
    monkeypatch.setattr(stripe_connect.db, "update_listing", lambda lid, patch: listing_updates.append((lid, patch)))
    notified = []
    monkeypatch.setattr(stripe_connect.notifications, "notify", lambda *a, **k: notified.append((a, k)))

    stripe_connect.refund_order_item("order-1", "item-1", "actor-1", reason="Buyer changed their mind")

    refund_call = fake_stripe.calls["Refund.create"][0]
    assert refund_call["payment_intent"] == "pi_fake123"
    assert refund_call["amount"] == 10000  # 100 kr in öre
    assert refund_call["idempotency_key"] == "refund:item-1"

    reversal_call = fake_stripe.calls["Transfer.create_reversal"][0]
    assert reversal_call[0] == "tr_fake123"
    assert reversal_call[1]["amount"] == 9000  # only the seller's net, in öre
    assert reversal_call[1]["idempotency_key"] == "reversal:item-1"

    assert updated_refunds[-1][1]["status"] == "succeeded"
    assert updated_refunds[-1][1]["stripe_refund_id"] == "re_fake123"
    assert item_updates == [("item-1", "refunded")]
    assert payout_updates[-1][1]["transfer_status"] == "reversed"
    assert recomputed == ["order-1"]
    assert listing_updates == [("listing-1", {"status": "published"})]
    assert notified  # buyer was told


def test_refund_stripe_failure_marks_refund_row_failed_and_raises(fake_stripe, monkeypatch):
    fake_stripe.refund_should_fail = True
    order = _order([_item(status="paid", price=100)])
    order["stripe_payment_intent_id"] = "pi_fake123"
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    monkeypatch.setattr(stripe_connect.db, "create_refund", lambda *a: {"id": "refund-row-1"})
    updated = []
    monkeypatch.setattr(stripe_connect.db, "update_refund", lambda rid, **f: updated.append((rid, f)))
    with pytest.raises(stripe_connect.ConnectError):
        stripe_connect.refund_order_item("order-1", "item-1", "actor-1")
    assert updated == [("refund-row-1", {"status": "failed"})]


def test_refund_without_a_prior_transfer_skips_reversal(fake_stripe, monkeypatch):
    order = _order([_item(status="paid", price=100, stripe_transfer_id=None)])
    order["stripe_payment_intent_id"] = "pi_fake123"
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    monkeypatch.setattr(stripe_connect.db, "create_refund", lambda *a: {"id": "refund-row-1"})
    monkeypatch.setattr(stripe_connect.db, "update_refund", lambda *a, **k: None)
    monkeypatch.setattr(stripe_connect.db, "update_order_item", lambda *a: None)
    monkeypatch.setattr(stripe_connect.db, "update_order_item_payout", lambda *a, **k: None)
    monkeypatch.setattr(stripe_connect.db, "recompute_order_refund_status", lambda *a: None)
    monkeypatch.setattr(stripe_connect.notifications, "notify", lambda *a, **k: None)
    stripe_connect.refund_order_item("order-1", "item-1", "actor-1")
    assert fake_stripe.calls["Transfer.create_reversal"] == []


# ---------------------------------------------------------------------------
# Webhooks: signature verification and idempotency
# ---------------------------------------------------------------------------

def test_verify_webhook_rejects_bad_signature(fake_stripe):
    fake_stripe.webhook_should_fail = True
    with pytest.raises(ValueError):
        stripe_connect.verify_webhook(b"{}", "bad-sig")


def test_verify_webhook_accepts_valid_signature(fake_stripe):
    event = stripe_connect.verify_webhook(b"{}", "good-sig")
    assert event.id == "evt_1"
    assert fake_stripe.calls["Webhook.construct_event"][0][2] == "whsec_fake"


def test_duplicate_webhook_event_is_processed_only_once(fake_stripe, monkeypatch):
    processed_ids = set()
    monkeypatch.setattr(stripe_connect.db, "is_webhook_event_processed", lambda eid: eid in processed_ids)
    monkeypatch.setattr(stripe_connect.db, "mark_webhook_event_processed", lambda eid, etype: processed_ids.add(eid))
    order_calls = []
    monkeypatch.setattr(stripe_connect.commerce, "complete_order", lambda *a, **k: order_calls.append(a) or _order([]))
    monkeypatch.setattr(stripe_connect, "transfer_for_paid_order", lambda order: None)
    monkeypatch.setattr(stripe_connect.db, "update_order", lambda *a, **k: None)
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: _order([]))

    event = _Obj(id="evt_dup", type="checkout.session.completed",
                 data=_Obj(object=_Obj(metadata={"order_id": "order-1"}, payment_status="paid", payment_intent="pi_1")))
    stripe_connect.handle_webhook_event(event)
    stripe_connect.handle_webhook_event(event)
    assert len(order_calls) == 1


def test_failed_webhook_handling_is_not_marked_processed(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect.db, "is_webhook_event_processed", lambda eid: False)
    marked = []
    monkeypatch.setattr(stripe_connect.db, "mark_webhook_event_processed", lambda eid, etype: marked.append(eid))

    def boom(*a, **k):
        raise RuntimeError("db is down")

    monkeypatch.setattr(stripe_connect.commerce, "complete_order", boom)
    event = _Obj(id="evt_fail", type="checkout.session.completed",
                 data=_Obj(object=_Obj(metadata={"order_id": "order-1"}, payment_status="paid")))
    with pytest.raises(RuntimeError):
        stripe_connect.handle_webhook_event(event)
    assert marked == []  # so a Stripe retry of this same event will try again


def test_account_updated_webhook_syncs_status(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect.db, "is_webhook_event_processed", lambda eid: False)
    monkeypatch.setattr(stripe_connect.db, "mark_webhook_event_processed", lambda *a: None)
    synced = []
    monkeypatch.setattr(stripe_connect, "sync_account_status", lambda account_id: synced.append(account_id))
    event = _Obj(id="evt_acct", type="account.updated", data=_Obj(object=_Obj(id="acct_seller")))
    stripe_connect.handle_webhook_event(event)
    assert synced == ["acct_seller"]


def test_payment_failed_webhook_notifies_buyer_and_marks_order(fake_stripe, monkeypatch):
    monkeypatch.setattr(stripe_connect.db, "is_webhook_event_processed", lambda eid: False)
    monkeypatch.setattr(stripe_connect.db, "mark_webhook_event_processed", lambda *a: None)
    order = {"id": "order-1", "status": "pending_payment", "buyer_id": "buyer-1"}
    monkeypatch.setattr(stripe_connect.db, "fetch_order", lambda oid: order)
    updated = []
    monkeypatch.setattr(stripe_connect.db, "update_order", lambda oid, **f: updated.append((oid, f)))
    notified = []
    monkeypatch.setattr(stripe_connect.notifications, "notify", lambda *a, **k: notified.append(a))
    event = _Obj(id="evt_fail2", type="payment_intent.payment_failed", data=_Obj(object=_Obj(metadata={"order_id": "order-1"})))
    stripe_connect.handle_webhook_event(event)
    assert updated == [("order-1", {"status": "payment_failed"})]
    assert notified
