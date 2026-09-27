"""Deleting a garment's last photo removes the garment from the batch (the
client's case: a print close-up or a sleeve detected as a garment of its own).
It must disappear from results, packages, pricing and publishing -- and stay
gone when the workspace is re-seeded."""
from __future__ import annotations

import copy

import pytest

from app import workspace


@pytest.fixture
def store(monkeypatch):
    state = {"ws": {}}
    monkeypatch.setattr(workspace.db, "get_workspace", lambda job_id: copy.deepcopy(state["ws"]))

    def set_ws(job_id, data):
        state["ws"] = copy.deepcopy(data)
        return copy.deepcopy(data)

    monkeypatch.setattr(workspace.db, "set_workspace", set_ws)
    return state


def _g(gid, dets, category="bodysuit", size="62", color="vit"):
    return {"id": gid, "category": category, "size": size, "color": color, "brand": None, "detection_ids": dets,
            "image_variants": [{"detection_id": d, "image_id": d.split("_")[0], "original": "o", "crop": f"crops/{d}.jpg",
                                "display": f"crops/{d}.jpg"} for d in dets],
            "display_image": f"crops/{dets[0]}.jpg", "images": sorted({d.split('_')[0] for d in dets})}


def _result():
    return {"garments": [_g("g1", ["p0_d1", "p1_d4"]), _g("g2", ["p0_d2"]), _g("g3", ["p1_d7"])]}


def test_removing_one_of_several_photos_keeps_the_garment(store):
    workspace.seed_workspace("job", _result())
    ws = workspace.remove_garment_image("job", "g1", "p1_d4", ["p0_d1", "p1_d4"])
    assert ws.get("removed_garments") in (None, [])
    shown = workspace.apply_to_result(_result(), ws)
    assert [g["id"] for g in shown["garments"]] == ["g1", "g2", "g3"]
    assert shown["garments"][0]["detection_ids"] == ["p0_d1"]


def test_removing_the_last_photo_removes_the_garment_everywhere(store):
    workspace.seed_workspace("job", _result())
    assert "garment:job:g2" in store["ws"]["pricing"]
    ws = workspace.remove_garment_image("job", "g2", "p0_d2", ["p0_d2"])
    assert ws["removed_garments"] == ["g2"]
    assert "garment:job:g2" not in ws["pricing"]
    assert "g2" not in ws["listings"]
    shown = workspace.apply_to_result(_result(), ws)
    assert [g["id"] for g in shown["garments"]] == ["g1", "g3"]


def test_a_removed_garment_is_not_priced_again_on_the_next_read(store):
    workspace.seed_workspace("job", _result())
    workspace.remove_garment_image("job", "g2", "p0_d2", ["p0_d2"])
    ws = workspace.seed_workspace("job", _result())  # every pricing read calls this
    assert "garment:job:g2" not in ws["pricing"]
    assert "g2" not in ws["listings"]


def test_a_package_that_drops_to_one_garment_is_dissolved(store):
    # g1..g3 share category and size, so they start as one package.
    workspace.seed_workspace("job", _result())
    group = store["ws"]["groups"]["groups"][0]
    assert sorted(group["garmentIds"]) == ["g1", "g2", "g3"]
    workspace.remove_garment_image("job", "g2", "p0_d2", ["p0_d2"])
    ws = workspace.remove_garment_image("job", "g3", "p1_d7", ["p1_d7"])
    assert ws["groups"]["groups"] == []
    assert ws["groups"]["ungrouped"] == ["g1"]
    assert f"group:job:{group['id']}" not in ws["pricing"]


def test_a_shrunk_package_is_repriced_unless_the_seller_set_its_price(store):
    four = {"garments": _result()["garments"] + [_g("g4", ["p2_d9"])]}
    workspace.seed_workspace("job", four)
    group = store["ws"]["groups"]["groups"][0]
    key = f"group:job:{group['id']}"
    assert store["ws"]["pricing"][key]["meta"]["itemCount"] == 4

    ws = workspace.remove_garment_image("job", "g2", "p0_d2", ["p0_d2"])
    assert ws["pricing"][key]["meta"]["itemCount"] == 3  # AI price follows the new size

    store["ws"]["pricing"][key].update(status="manually_adjusted", finalPrice=99)
    ws = workspace.remove_garment_image("job", "g3", "p1_d7", ["p1_d7"])
    assert ws["groups"]["groups"][0]["garmentIds"] == ["g1", "g4"]
    assert ws["pricing"][key]["finalPrice"] == 99  # the seller's own price is left alone
