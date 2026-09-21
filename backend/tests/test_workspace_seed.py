"""seed_workspace is called on every read of a job's pricing -- the admin
pricing screen alone calls it several times per job across every job on the
platform. It must only write to the database when it actually adds
something new, or that screen redoes a database write on every single
request for every job, every time, forever."""
from __future__ import annotations

from app import workspace


def _result(garments):
    return {"garments": garments}


def _garment(gid="g1", category="dress", size="86"):
    return {"id": gid, "category": category, "size": size, "brand": None, "color": "vit"}


def test_first_seed_writes_and_fills_in_pricing_listings_and_groups(monkeypatch):
    stored = {}
    monkeypatch.setattr(workspace.db, "get_workspace", lambda job_id: dict(stored))
    writes = []

    def fake_set(job_id, data):
        writes.append(data)
        stored.clear()
        stored.update(data)
        return data

    monkeypatch.setattr(workspace.db, "set_workspace", fake_set)

    # Two garments sharing size+category so compute_groups actually forms a
    # group (a lone garment of its size/category goes to "ungrouped").
    result = workspace.seed_workspace("job1", _result([_garment("g1"), _garment("g2")]))
    assert len(writes) == 1
    assert "garment:job1:g1" in result["pricing"]
    assert "g1" in result["listings"]
    assert result["groups"]["groups"]


def test_second_seed_of_an_already_seeded_job_does_not_write(monkeypatch):
    stored = {}
    monkeypatch.setattr(workspace.db, "get_workspace", lambda job_id: dict(stored))
    writes = []

    def fake_set(job_id, data):
        writes.append(data)
        stored.clear()
        stored.update(data)
        return data

    monkeypatch.setattr(workspace.db, "set_workspace", fake_set)

    garments = [_garment()]
    first = workspace.seed_workspace("job1", _result(garments))
    assert len(writes) == 1

    # Simulate the admin pricing screen calling this several times in a row
    # for the very same, already-seeded job.
    for _ in range(5):
        again = workspace.seed_workspace("job1", _result(garments))
        assert again == first
    assert len(writes) == 1  # still just the one write from the initial seed


def test_a_newly_added_garment_is_seeded_without_touching_existing_pricing(monkeypatch):
    stored = {}
    monkeypatch.setattr(workspace.db, "get_workspace", lambda job_id: dict(stored))
    writes = []

    def fake_set(job_id, data):
        writes.append(data)
        stored.clear()
        stored.update(data)
        return data

    monkeypatch.setattr(workspace.db, "set_workspace", fake_set)

    workspace.seed_workspace("job1", _result([_garment("g1")]))
    original_pricing = stored["pricing"]["garment:job1:g1"]

    updated = workspace.seed_workspace("job1", _result([_garment("g1"), _garment("g2")]))
    assert len(writes) == 2  # the new garment triggered exactly one more write
    assert updated["pricing"]["garment:job1:g1"] == original_pricing  # untouched
    assert "garment:job1:g2" in updated["pricing"]
