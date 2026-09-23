"""When attribute extraction failed for a detection (vision call rate
limited / errored), the matcher only has CLIP similarity left -- and CLIP
put a pair of leggings and a bodysuit at 0.877 in a real batch. Such a
detection must stay its own garment, flagged for review, instead of being
merged into whatever it happens to look like."""
from __future__ import annotations

import numpy as np

from ai_engine.matching import build_garments, pairwise_score
from ai_engine.schemas import AttributeConfidence, Attributes, BBox, Detection, MatchStatus


def det(det_id: str, image_id: str) -> Detection:
    return Detection(id=det_id, image_id=image_id, bbox=BBox(x1=0, y1=0, x2=10, y2=10), detector_confidence=0.9)


def known(det_id: str, category: str = "leggings", color: str = "vit med små prickar") -> Attributes:
    return Attributes(
        detection_id=det_id,
        category=category,
        color=color,
        confidence=AttributeConfidence(category=0.9, color=0.9),
    )


def unavailable(det_id: str) -> Attributes:
    return Attributes(detection_id=det_id, category="unknown", unavailable=True)


def test_an_unavailable_detection_scores_zero_against_everything():
    emb = np.array([1.0, 0.0])
    assert pairwise_score(known("a"), unavailable("b"), emb, emb, [], []) == 0.0
    assert pairwise_score(unavailable("a"), known("b"), emb, emb, [], []) == 0.0
    assert pairwise_score(known("a"), known("b"), emb, emb, [], []) > 0.0


def test_leggings_and_an_unreadable_crop_stay_separate_even_when_clip_agrees():
    leggings = det("00_2971_det3", "p1")
    unreadable = det("01_2972_det8", "p2")
    emb = np.array([1.0, 0.0])  # identical embeddings: CLIP says "same"
    garments = build_garments(
        [leggings, unreadable],
        {leggings.id: known(leggings.id), unreadable.id: unavailable(unreadable.id)},
        {leggings.id: emb, unreadable.id: emb},
        {leggings.id: [], unreadable.id: []},
    )
    assert len(garments) == 2
    by_det = {g.detection_ids[0]: g for g in garments}
    assert by_det[leggings.id].category == "leggings"
    assert by_det[unreadable.id].match_status == MatchStatus.NEEDS_REVIEW
    assert by_det[unreadable.id].category == "unknown"


def test_two_readable_matching_crops_still_merge():
    a, b = det("a", "p1"), det("b", "p2")
    emb = np.array([1.0, 0.0])
    garments = build_garments([a, b], {"a": known("a"), "b": known("b")}, {"a": emb, "b": emb}, {"a": [], "b": []})
    assert len(garments) == 1
    assert sorted(garments[0].detection_ids) == ["a", "b"]


def test_a_lone_unreadable_garment_is_never_high_confidence():
    a = det("a", "p1")
    garments = build_garments([a], {"a": unavailable("a")}, {"a": np.array([1.0, 0.0])}, {"a": []})
    assert garments[0].match_status == MatchStatus.NEEDS_REVIEW
