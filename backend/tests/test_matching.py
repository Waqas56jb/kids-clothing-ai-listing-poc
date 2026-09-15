from __future__ import annotations

import numpy as np
import pytest

from ai_engine.matching import build_garments, is_vetoed, pairwise_score
from ai_engine.schemas import AttributeConfidence, Attributes, BBox, Detection, MatchStatus


def make_detection(det_id: str, image_id: str) -> Detection:
    return Detection(id=det_id, image_id=image_id, bbox=BBox(x1=0, y1=0, x2=10, y2=10), detector_confidence=0.9)


def make_attributes(
    det_id: str,
    category: str = "bodysuit",
    brand: str | None = None,
    size: str | None = None,
    color: str | None = None,
    condition: str | None = None,
    defects: str | None = None,
) -> Attributes:
    return Attributes(
        detection_id=det_id,
        category=category,
        brand=brand,
        size=size,
        color=color,
        condition=condition,
        defects=defects,
        confidence=AttributeConfidence(category=0.9, brand=0.9, size=0.9, color=0.9, condition=0.9, gender=0.9),
    )


def test_identical_category_and_high_embedding_merge_with_high_confidence():
    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img2")
    attr_a = make_attributes("d1", brand="H&M", size="86", color="blue")
    attr_b = make_attributes("d2", brand="H&M", size="86", color="blue")
    emb = np.array([1.0, 0.0])

    garments = build_garments(
        [det_a, det_b],
        {"d1": attr_a, "d2": attr_b},
        {"d1": emb, "d2": emb},
        {"d1": ["H&M", "86"], "d2": ["H&M", "86"]},
    )

    assert len(garments) == 1
    garment = garments[0]
    assert sorted(garment.images) == ["img1", "img2"]
    # identical embedding + identical brand/size/color is exactly the
    # "could be one item or two identical items" case -> flagged, not silently merged
    assert garment.match_status == MatchStatus.NEEDS_REVIEW


def test_different_known_categories_never_merge():
    attr_a = make_attributes("d1", category="jacket")
    attr_b = make_attributes("d2", category="trousers")
    assert is_vetoed(attr_a, attr_b) is True

    emb = np.array([1.0, 0.0])
    score = pairwise_score(attr_a, attr_b, emb, emb, [], [])
    assert score == 0.0

    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img1")
    garments = build_garments(
        [det_a, det_b], {"d1": attr_a, "d2": attr_b}, {"d1": emb, "d2": emb}, {"d1": [], "d2": []}
    )
    assert len(garments) == 2


def test_borderline_similarity_merges_as_medium_confidence():
    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img2")
    # unknown brand/size/color on both sides -> neutral 0.5 signal each
    attr_a, attr_b = make_attributes("d1"), make_attributes("d2")
    emb_a = np.array([1.0, 0.0])
    emb_b = np.array([0.9, (1 - 0.9**2) ** 0.5])  # cosine similarity = 0.9

    garments = build_garments(
        [det_a, det_b], {"d1": attr_a, "d2": attr_b}, {"d1": emb_a, "d2": emb_b}, {"d1": [], "d2": []}
    )

    assert len(garments) == 1
    assert garments[0].match_status == MatchStatus.MEDIUM_CONFIDENCE


def test_low_similarity_stays_as_separate_garments():
    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img2")
    attr_a, attr_b = make_attributes("d1", color="blue"), make_attributes("d2", color="red")
    emb_a, emb_b = np.array([1.0, 0.0]), np.array([0.0, 1.0])  # orthogonal, cosine = 0

    garments = build_garments(
        [det_a, det_b], {"d1": attr_a, "d2": attr_b}, {"d1": emb_a, "d2": emb_b}, {"d1": [], "d2": []}
    )

    assert len(garments) == 2
    assert {g.match_status for g in garments} == {MatchStatus.HIGH_CONFIDENCE}


def test_single_detection_is_its_own_high_confidence_garment():
    det = make_detection("d1", "img1")
    attr = make_attributes("d1")
    emb = np.array([1.0, 0.0])

    garments = build_garments([det], {"d1": attr}, {"d1": emb}, {"d1": []})

    assert len(garments) == 1
    assert garments[0].match_confidence == 1.0
    assert garments[0].match_status == MatchStatus.HIGH_CONFIDENCE


def test_two_different_items_in_the_same_photo_never_merge():
    # same embedding, same everything -- the kind of pair that WOULD merge
    # if these were two photos of one item, but they're two detections
    # inside one flatlay photo, so they must stay separate no matter what.
    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img1")
    attr_a, attr_b = make_attributes("d1"), make_attributes("d2")
    emb = np.array([1.0, 0.0])

    garments = build_garments(
        [det_a, det_b], {"d1": attr_a, "d2": attr_b}, {"d1": emb, "d2": emb}, {"d1": [], "d2": []}
    )

    assert len(garments) == 2


def test_defect_seen_in_any_photo_overrides_a_clean_looking_condition():
    det_a, det_b = make_detection("d1", "img1"), make_detection("d2", "img2")
    # the angle in img1 caught a tear; img2's angle looks clean and scored "good"
    attr_a = make_attributes("d1", condition="damaged", defects="small tear at hem")
    attr_b = make_attributes("d2", condition="good", defects=None)
    emb = np.array([1.0, 0.0])

    garments = build_garments(
        [det_a, det_b], {"d1": attr_a, "d2": attr_b}, {"d1": emb, "d2": emb}, {"d1": [], "d2": []}
    )

    assert len(garments) == 1
    assert garments[0].defects == "small tear at hem"
    assert garments[0].condition == "damaged"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
