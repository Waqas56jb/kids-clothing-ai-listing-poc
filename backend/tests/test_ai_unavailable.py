from __future__ import annotations

import pytest

from ai_engine.pipeline import AiUnavailable, _raise_if_nothing_was_read
from ai_engine.schemas import Attributes


def _unread(det_id):
    return Attributes(detection_id=det_id, unavailable=True)


def test_a_batch_where_nothing_could_be_read_stops_with_a_clear_message():
    with pytest.raises(AiUnavailable) as err:
        _raise_if_nothing_was_read({"a": _unread("a"), "b": _unread("b")}, quota_failures=2)
    assert "försök igen senare" in str(err.value).lower()
    assert "krediter" not in str(err.value)  # account details are for the admin, not every seller


def test_partial_reads_still_produce_results():
    _raise_if_nothing_was_read({"a": _unread("a"), "b": Attributes(detection_id="b", category="hat")}, quota_failures=1)


def test_failures_for_other_reasons_do_not_stop_the_batch():
    _raise_if_nothing_was_read({"a": _unread("a")}, quota_failures=0)


def test_admins_are_alerted_with_the_real_reason(monkeypatch):
    from app import jobs

    monkeypatch.setattr(jobs.db, "list_admin_ids", lambda: ["admin-1", "admin-2"])
    sent = []
    monkeypatch.setattr(jobs.notifications, "notify", lambda uid, kind, title, body="", **k: sent.append((uid, kind, body)))
    jobs._alert_admins_ai_unavailable("job-1")
    assert [s[0] for s in sent] == ["admin-1", "admin-2"]
    assert all(s[1] == "ai_unavailable" and "krediter" in s[2] for s in sent)
