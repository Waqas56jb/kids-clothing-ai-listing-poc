from __future__ import annotations

import numpy as np

from ai_engine.matching import build_garments, is_vetoed, primary_color
from ai_engine.schemas import AttributeConfidence, Attributes, BBox, Detection


def det(det_id: str, image_id: str) -> Detection:
    return Detection(id=det_id, image_id=image_id, bbox=BBox(x1=0, y1=0, x2=10, y2=10), detector_confidence=0.9)


def attrs(det_id: str, color: str | None, brand: str = "H&M", size: str = "62") -> Attributes:
    return Attributes(
        detection_id=det_id,
        category="bodysuit",
        brand=brand,
        size=size,
        color=color,
        condition="good",
        confidence=AttributeConfidence(category=0.9, brand=0.9, size=0.9, color=0.9, condition=0.9, gender=0.0),
    )


def test_primary_color_understands_swedish_and_compounds():
    assert primary_color("vit med små prickar") == "white"
    assert primary_color("ljusrosa") == "pink"
    assert primary_color("mörkblå med vita ränder") == "blue"
    assert primary_color("flerfärgad geometrisk") is None
    assert primary_color(None) is None


def test_confident_color_disagreement_vetoes_a_merge():
    assert is_vetoed(attrs("a", "vit med små prickar"), attrs("b", "rosa")) is True
    assert is_vetoed(attrs("a", "vit"), attrs("b", "krämvit")) is False


def test_same_brand_and_size_but_different_colors_stay_separate_garments():
    # Three H&M size-62 bodysuits (white, pink, white-dotted) photographed in
    # three photos each: CLIP thinks they look alike, but they are three
    # different garments and must not collapse into one.
    emb = np.array([1.0, 0.0])
    detections, attributes, embeddings = [], {}, {}
    colors = {"white": "vit", "pink": "rosa", "dotted": "vit med små prickar"}
    for photo in ("p1", "p2", "p3"):
        for name, color in colors.items():
            det_id = f"{name}_{photo}"
            detections.append(det(det_id, photo))
            attributes[det_id] = attrs(det_id, color)
            embeddings[det_id] = emb
    garments = build_garments(detections, attributes, embeddings, {d.id: [] for d in detections})
    # white + white-dotted share a color family, so they may merge; pink never joins them.
    pink = [g for g in garments if g.color == "rosa"]
    assert len(pink) == 1 and len(pink[0].detection_ids) == 3
    assert all("pink" not in det_id for g in garments if g.color != "rosa" for det_id in g.detection_ids)


def test_complete_linkage_prevents_chaining_through_a_middle_item():
    # A~B and B~C are above threshold, but A and C are clearly different:
    # single-link would chain all three; complete-link keeps A and C apart.
    a, b, c = det("a", "p1"), det("b", "p2"), det("c", "p3")
    attributes = {"a": attrs("a", None), "b": attrs("b", None), "c": attrs("c", None)}
    embeddings = {
        "a": np.array([1.0, 0.0]),
        "b": np.array([0.85, (1 - 0.85**2) ** 0.5]),  # cos(a,b)=0.85
        "c": np.array([0.45, (1 - 0.45**2) ** 0.5]),  # cos(a,c)=0.45, cos(b,c)~0.85
    }
    garments = build_garments([a, b, c], attributes, embeddings, {"a": [], "b": [], "c": []})
    ids = {tuple(g.detection_ids) for g in garments}
    assert ("a", "b", "c") not in ids
    assert len(garments) == 2
