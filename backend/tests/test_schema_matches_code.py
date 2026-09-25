"""Every status value the code writes must be allowed by the database's own
CHECK constraint. Unit tests mock the database, so a value missing from the
constraint only fails in production -- after Stripe has already moved money
(a refund's "cancelled" payout status did exactly that on 2026-09-25)."""
from __future__ import annotations

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _allowed(constraint: str) -> set[str]:
    schema = (BACKEND / "db" / "schema.sql").read_text(encoding="utf-8")
    match = re.search(rf"{constraint}\s+check \(\w+ in \(([^)]*)\)\)", schema)
    assert match, f"constraint {constraint} not found"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def _written(pattern: str) -> set[str]:
    values: set[str] = set()
    for path in (BACKEND / "app").glob("*.py"):
        values |= set(re.findall(pattern, path.read_text(encoding="utf-8")))
    return values


def test_every_transfer_status_the_code_writes_is_allowed_by_the_schema():
    written = _written(r"transfer_status\s*=\s*['\"]([a-z_]+)['\"]")
    written |= _written(r"transfer_status = '([a-z_]+)'")
    from app import stripe_connect

    written |= set(stripe_connect._SETTLED_TRANSFER_STATUSES)
    assert "cancelled" in written and "pending_onboarding" in written
    assert written <= _allowed("order_items_transfer_status_check"), written - _allowed("order_items_transfer_status_check")
