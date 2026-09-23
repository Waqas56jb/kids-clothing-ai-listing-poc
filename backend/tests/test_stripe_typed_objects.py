"""stripe-python >= 15 returns typed resources that are *not* dicts: `.get`,
`in` and iteration raise. test_stripe_connect.py fakes the SDK with dict-like
objects, which is how `account.get(...)` reached production and 500'd the
seller onboarding return (`/api/connect/refresh`). These tests drive the
same code paths with the real SDK's own objects (built offline via
`construct_from`, no network, no key) so that mismatch can't recur."""
from __future__ import annotations

import stripe

from app import commerce, db, stripe_connect
from app.commerce import stripe_as_dict

KEY = "sk_test_dummy"


def _account(**fields):
    base = {"id": "acct_typed1", "object": "account", "charges_enabled": True, "payouts_enabled": True, "details_submitted": True}
    return stripe.Account.construct_from({**base, **fields}, KEY)


def _session(**fields):
    base = {"id": "cs_typed1", "object": "checkout.session", "payment_status": "paid", "payment_intent": "pi_typed1", "metadata": {"order_id": "order-1"}}
    return stripe.checkout.Session.construct_from({**base, **fields}, KEY)


def test_typed_stripe_objects_really_are_not_dicts():
    account = _account()
    assert not isinstance(account, dict)
    assert not hasattr(account, "get")
    assert stripe_as_dict(account)["payouts_enabled"] is True
    assert stripe_as_dict(_session())["metadata"] == {"order_id": "order-1"}
    assert stripe_as_dict(None) == {}
    assert stripe_as_dict({"already": "dict"}) == {"already": "dict"}


def test_sync_account_status_reads_a_typed_account(monkeypatch):
    monkeypatch.setattr(commerce, "STRIPE_SECRET_KEY", KEY)
    monkeypatch.setattr(stripe.Account, "retrieve", staticmethod(lambda account_id: _account(payouts_enabled=False)))
    recorded = {}

    def fake_update(account_id, **flags):
        recorded["account_id"] = account_id
        recorded.update(flags)
        return {"id": "user-1", **flags}

    monkeypatch.setattr(db, "update_seller_stripe_status", fake_update)
    monkeypatch.setattr(db, "list_pending_onboarding_transfers", lambda seller_id: [])

    profile = stripe_connect.sync_account_status("acct_typed1")

    assert profile["id"] == "user-1"
    assert recorded == {"account_id": "acct_typed1", "charges_enabled": True, "payouts_enabled": False, "details_submitted": True}


def test_confirm_stripe_reads_a_typed_checkout_session(monkeypatch):
    monkeypatch.setattr(commerce, "STRIPE_SECRET_KEY", KEY)
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", staticmethod(lambda session_id: _session()))
    updates = []
    monkeypatch.setattr(db, "update_order", lambda order_id, **fields: updates.append((order_id, fields)) or {"id": order_id, **fields})
    monkeypatch.setattr(commerce, "complete_order", lambda order_id, payment_ref=None: {"id": order_id, "status": "paid", "payment_ref": payment_ref})
    monkeypatch.setattr(stripe_connect, "transfer_for_paid_order", lambda order: None)

    order = commerce.confirm_stripe({"id": "order-1", "status": "pending_payment", "payment_ref": "cs_typed1"}, "cs_typed1")

    assert order["status"] == "paid"
    assert order["payment_ref"] == "pi_typed1"
    assert ("order-1", {"stripe_payment_intent_id": "pi_typed1"}) in updates


def test_confirm_stripe_rejects_a_typed_session_for_another_order(monkeypatch):
    monkeypatch.setattr(commerce, "STRIPE_SECRET_KEY", KEY)
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", staticmethod(lambda session_id: _session(metadata={"order_id": "someone-else"})))
    try:
        commerce.confirm_stripe({"id": "order-1", "status": "pending_payment"}, "cs_typed1")
    except commerce.CheckoutError as exc:
        assert "hör inte till" in str(exc)
    else:
        raise AssertionError("a session for a different order must be rejected")


def test_webhook_handler_reads_typed_event_payloads(monkeypatch):
    monkeypatch.setattr(commerce, "STRIPE_SECRET_KEY", KEY)
    monkeypatch.setattr(db, "is_webhook_event_processed", lambda event_id: False)
    processed = []
    monkeypatch.setattr(db, "mark_webhook_event_processed", lambda event_id, event_type: processed.append((event_id, event_type)))

    synced = []
    monkeypatch.setattr(stripe_connect, "sync_account_status", lambda account_id: synced.append(account_id))
    account_event = stripe.Event.construct_from(
        {"id": "evt_acct", "object": "event", "type": "account.updated", "data": {"object": {"id": "acct_typed1", "object": "account"}}},
        KEY,
    )
    assert not isinstance(account_event, dict)
    stripe_connect.handle_webhook_event(account_event)
    assert synced == ["acct_typed1"]

    completed = []
    monkeypatch.setattr(commerce, "complete_order", lambda order_id, payment_ref=None: completed.append((order_id, payment_ref)) or {"id": order_id, "status": "paid"})
    monkeypatch.setattr(db, "update_order", lambda order_id, **fields: {"id": order_id, **fields})
    monkeypatch.setattr(db, "fetch_order", lambda order_id: {"id": order_id, "status": "paid", "items": []})
    transferred = []
    monkeypatch.setattr(stripe_connect, "transfer_for_paid_order", lambda order: transferred.append(order["id"]))
    checkout_event = stripe.Event.construct_from(
        {
            "id": "evt_checkout",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_typed1", "object": "checkout.session", "payment_status": "paid", "payment_intent": "pi_typed1", "metadata": {"order_id": "order-1"}}},
        },
        KEY,
    )
    stripe_connect.handle_webhook_event(checkout_event)
    assert completed == [("order-1", "pi_typed1")]
    assert transferred == ["order-1"]
    assert processed == [("evt_acct", "account.updated"), ("evt_checkout", "checkout.session.completed")]
