"""Replay two real client batches -- the vision model's own reads, the real
embeddings and boxes -- through duplicate collapsing and matching, and
compare with the ground truth counted by eye from the photos.

pile15: job f0ba6e67b039 (2026-09-30), 15 garments photographed 4 times.
        Before the fix: 20 listings, 4 of them mixing two garments.
pile9:  job 4a821ef35d56 (2026-09-25), 9 garments photographed 3 times.
products12: the repo's 12 sample product photos, 12 *different* products --
        the lenient re-shoot rules alone merged 5 of them; nothing may merge.
pile20: job 9863ed6fa8c0 (2026-09-30), 20 garments photographed 4 times --
        two plain bodysuits CLIP could not tell apart (khaki vs rose-brown,
        sage vs light blue), a floral dress read "romper", fruit leggings
        next to yellow trousers. Before the garment's measured colour was
        used: 22 listings, 5 of them mixing two garments.

Every detection also carries its measured colour (median CIELAB of its mask
pixels, ai_engine.color_signature), computed from the original photos.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pytest

from ai_engine import pipeline
from ai_engine.matching import build_garments
from ai_engine.schemas import Attributes, BBox, Detection

FIXTURES = Path(__file__).parent / "fixtures" / "real_piles"


class _Area:
    """Stands in for a mask where only its pixel count matters."""

    def __init__(self, pixels: int) -> None:
        self.pixels = pixels

    def sum(self) -> int:
        return self.pixels


def _replay(name: str):
    data = json.loads((FIXTURES / name / "data.json").read_text(encoding="utf-8"))
    embeddings = dict(np.load(FIXTURES / name / "embeddings.npz"))
    attributes = {k: Attributes(**v) for k, v in data["attributes"].items()}
    boxes = data.get("boxes") or {}
    detections = []
    for row in data["detections"]:
        x1, y1, x2, y2 = (boxes[row["id"]][:4] if row["id"] in boxes else (0, 0, 1, 1))
        detections.append(Detection(id=row["id"], image_id=row["image_id"], bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2), detector_confidence=0.5))
    if boxes:
        areas = {d.id: _Area(boxes[d.id][5]) for d in detections}
        twins = pipeline._same_garment_twice(detections, attributes, areas)
        detections = [d for d in detections if d.id not in twins]
    else:
        twins = set()
    colors = {k: (np.array(v) if v is not None else None) for k, v in (data.get("measured_colors") or {}).items()}
    garments = build_garments(detections, attributes, embeddings, data["ocr"], colors)
    truth = {k: v.rstrip("*") for k, v in data["truth"].items()}
    return garments, truth, twins, data["truth"]


@pytest.mark.parametrize("name, expected", [("pile15", 15), ("pile9", 9), ("pile20", 20)])
def test_every_real_garment_is_one_listing_with_all_its_photos(name, expected):
    garments, truth, _twins, _raw = _replay(name)
    listings_per_garment = defaultdict(set)
    for garment in garments:
        labels = {truth[det_id] for det_id in garment.detection_ids}
        assert len(labels) == 1, f"{garment.id} mixes garments {labels}"
        listings_per_garment[labels.pop()].add(garment.id)
    split = {label: ids for label, ids in listings_per_garment.items() if len(ids) > 1}
    assert not split, f"garments split over several listings: {split}"
    assert len(garments) == expected


def test_only_the_two_real_duplicate_boxes_are_collapsed():
    _garments, _truth, twins, raw = _replay("pile15")
    assert twins == {det_id for det_id, label in raw.items() if label.endswith("*")}


def test_a_listing_is_named_by_what_most_photos_saw():
    # The dusty-pink velour trousers were read "trousers" 3x, "sweatshirt" 1x.
    garments, truth, _twins, _raw = _replay("pile15")
    velour = next(g for g in garments if truth[g.detection_ids[0]] == "V")
    assert velour.category == "trousers"


def test_photos_of_different_products_are_never_merged():
    garments, truth, _twins, _raw = _replay("products12")
    for garment in garments:
        photos = {truth[det_id] for det_id in garment.detection_ids}
        assert len(photos) == 1, f"{garment.id} merges different products: {photos}"


def test_the_dress_read_as_romper_in_two_photos_is_still_one_listing():
    garments, truth, _twins, _raw = _replay("pile20")
    dress = [g for g in garments if {truth[d] for d in g.detection_ids} == {"DR"}]
    assert len(dress) == 1 and len(dress[0].detection_ids) == 4
    assert dress[0].category == "dress"


def test_without_the_measured_colour_the_look_alikes_mix():
    # Guards the reason the measurement exists: take it away and pile20's
    # look-alike bodysuits land in each other's listings again.
    data = json.loads((FIXTURES / "pile20" / "data.json").read_text(encoding="utf-8"))
    embeddings = dict(np.load(FIXTURES / "pile20" / "embeddings.npz"))
    attributes = {k: Attributes(**v) for k, v in data["attributes"].items()}
    detections = [Detection(id=r["id"], image_id=r["image_id"], bbox=BBox(x1=0, y1=0, x2=1, y2=1), detector_confidence=0.5)
                  for r in data["detections"]]
    garments = build_garments(detections, attributes, embeddings, data["ocr"])
    assert any(len({data["truth"][d] for d in g.detection_ids}) > 1 for g in garments)
