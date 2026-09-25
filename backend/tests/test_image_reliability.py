"""Tests for the stricter "never show a bad AI image" logic added in
response to client feedback: overlapping garments were sometimes producing
cutouts with missing/invented-looking parts, or even a misclassified
category (a garment read as a hat). The fix has three parts, each covered
here:

1. Overlap detection compares real segmentation masks, not just boxes, so
   it also catches garments that only touch/overlap partially.
2. When a garment matched across several photos, the cover image is chosen
   by how clearly/fully it shows the garment, not just upload order.
3. A garment whose only available images all failed the overlap check is
   flagged for the seller to double-check, even if the *matching* itself
   was confident.
"""
from __future__ import annotations

import numpy as np

from ai_engine.pipeline import (
    _Prepared,
    _attach_images,
    _drop_duplicate_detections,
    _mask_inside_box_fraction,
    _mask_overlap_fraction,
    _overlapping_ids,
    _parts_of_bigger_garments,
)
from ai_engine.schemas import (
    AttributeConfidence,
    Attributes,
    BBox,
    Detection,
    DetectionImages,
    Garment,
    MatchStatus,
)
from ai_engine.utils.image_io import MaskQuality


def _det(det_id: str, image_id: str, confidence: float = 0.9, bbox: BBox | None = None) -> Detection:
    return Detection(id=det_id, image_id=image_id, bbox=bbox or BBox(x1=0, y1=0, x2=10, y2=10), detector_confidence=confidence)


def _quality(coverage: float = 0.7, extent_x: float = 0.9, extent_y: float = 0.9) -> MaskQuality:
    return MaskQuality(coverage=coverage, hole_fraction=0.0, extent_x=extent_x, extent_y=extent_y, rejected_reason=None)


def _prepared(det_id: str, image_id: str, *, occluded: bool = False, quality: MaskQuality, confidence: float = 0.9) -> _Prepared:
    det = _det(det_id, image_id, confidence)
    images = DetectionImages(
        detection_id=det_id,
        image_id=image_id,
        original=f"originals/{image_id}.jpg",
        crop=f"crops/{det_id}.jpg",
        display=f"crops/{det_id}.jpg",
        occluded=occluded,
    )
    return _Prepared(detection=det, images=images, ocr_texts=[], embedding=np.zeros(4), quality=quality)


def _garment(garment_id: str, detection_ids: list[str], status: MatchStatus = MatchStatus.HIGH_CONFIDENCE) -> Garment:
    return Garment(
        id=garment_id,
        category="dress",
        confidence=AttributeConfidence(),
        images=[],
        detection_ids=detection_ids,
        match_confidence=1.0,
        match_status=status,
    )


# ---------------------------------------------------------------------------
# Mask-based overlap detection
# ---------------------------------------------------------------------------

def _mask(height: int, width: int) -> np.ndarray:
    return np.zeros((height, width), dtype=bool)


def test_non_overlapping_masks_have_zero_overlap_fraction():
    a = _mask(100, 100)
    a[0:40, 0:40] = True
    b = _mask(100, 100)
    b[60:100, 60:100] = True
    assert _mask_overlap_fraction(a, b) == 0.0


def test_small_mask_mostly_inside_a_bigger_one_is_high_overlap():
    # A small garment (e.g. a bunched sleeve) whose mask sits almost
    # entirely inside a much bigger neighbour's mask -- this is exactly the
    # "swallowed by a bigger garment" case a plain IoU check would miss,
    # since the union is dominated by the big mask and IoU stays low.
    big = _mask(100, 100)
    big[0:100, 0:100] = True
    small = _mask(100, 100)
    small[10:20, 10:20] = True  # fully inside `big`
    assert _mask_overlap_fraction(small, big) == 1.0


def test_edge_touching_masks_cross_the_threshold():
    a = _mask(100, 100)
    a[0:50, 0:50] = True  # area 2500
    b = _mask(100, 100)
    b[0:50, 40:90] = True  # area 2500, overlaps a's last 10 columns -> 500 px shared
    fraction = _mask_overlap_fraction(a, b)
    assert fraction == 500 / 2500
    assert fraction >= 0.06  # crosses the pipeline's flagging threshold


def test_overlapping_ids_only_flags_pairs_in_the_same_photo():
    masks = {
        "p1_det0": np.zeros((10, 10), dtype=bool),
        "p1_det1": np.zeros((10, 10), dtype=bool),
        "p2_det0": np.zeros((10, 10), dtype=bool),
    }
    masks["p1_det0"][0:8, 0:8] = True
    masks["p1_det1"][0:8, 0:8] = True  # same photo, fully overlapping -> flagged
    masks["p2_det0"][0:8, 0:8] = True  # different photo, would "overlap" p1's masks by coincidence but must never be compared across photos

    detections = [_det("p1_det0", "p1"), _det("p1_det1", "p1"), _det("p2_det0", "p2")]
    overlapping = _overlapping_ids(detections, masks)
    assert overlapping == {"p1_det0", "p1_det1"}


def _dedup(detections, masks, fallback=None):
    return _drop_duplicate_detections(detections, masks, fallback or {d.id: False for d in detections})


def test_the_same_garment_boxed_twice_keeps_the_more_confident_box():
    # Two prompt phrases firing on one garment: near-identical masks.
    a = _mask(200, 200)
    a[0:150, 0:150] = True
    b = _mask(200, 200)
    b[5:150, 5:150] = True
    result = _dedup([_det("a", "img", confidence=0.4), _det("b", "img", confidence=0.9)], {"a": a, "b": b})
    assert [d.id for d in result.kept] == ["b"]
    assert result.dropped == 1 and result.nested_in == {}


def test_a_tiny_piece_inside_a_garment_is_dropped_even_if_the_detector_liked_it_more():
    big = _mask(200, 200)
    big[0:150, 0:150] = True                    # 22500 px
    tag = _mask(200, 200)
    tag[10:40, 10:40] = True                    # 900 px = 4% -- a tag, a foot, a sleeve sliver
    result = _dedup([_det("big", "img", confidence=0.3), _det("tag", "img", confidence=0.95)], {"big": big, "tag": tag})
    assert [d.id for d in result.kept] == ["big"]
    assert result.dropped == 1


def test_a_mid_size_item_inside_a_garment_is_kept_for_vision_to_judge():
    # The Pooh hat on the giraffe bodysuit: 18% of its mask and entirely
    # inside it because SAM2's bodysuit mask bled over the hat. Geometry
    # can't tell that from a big part of the bodysuit, so both go on.
    body = _mask(200, 200)
    body[0:150, 0:150] = True                   # 22500 px
    hat = _mask(200, 200)
    hat[100:150, 70:150] = True                 # 4000 px = 18%, inside `body`
    result = _dedup([_det("body", "img"), _det("hat", "img")], {"body": body, "hat": hat})
    assert {d.id for d in result.kept} == {"body", "hat"}
    assert result.nested_in == {"hat": "body"}
    assert result.dropped == 0


def test_a_box_around_two_garments_is_dropped_and_both_garments_kept():
    # Measured: one detector box around a bodysuit and the romper next to
    # it, each ~50% of the box's mask -- dropped even though the detector
    # was more confident about it than about either garment.
    left = _mask(200, 200)
    left[0:100, 0:95] = True
    right = _mask(200, 200)
    right[0:100, 105:200] = True
    pair = left | right
    detections = [_det("pair", "img", confidence=0.9), _det("left", "img", confidence=0.3), _det("right", "img", confidence=0.3)]
    result = _dedup(detections, {"pair": pair, "left": left, "right": right})
    assert {d.id for d in result.kept} == {"left", "right"}


def test_a_garment_with_one_item_resting_on_it_is_not_a_group():
    body = _mask(200, 200)
    body[0:150, 0:150] = True
    hat = _mask(200, 200)
    hat[100:150, 70:150] = True
    result = _dedup([_det("body", "img"), _det("hat", "img")], {"body": body, "hat": hat})
    assert "body" in {d.id for d in result.kept}


def test_two_different_garments_with_overlapping_boxes_are_not_treated_as_duplicates():
    # Two genuinely different garments (e.g. pants photographed overlapping
    # a shirt) whose *boxes* overlap a lot but whose actual segmented
    # fabric shares no pixels at all -- must never be collapsed into one.
    a = _mask(200, 200)
    a[0:100, 0:100] = True
    b = _mask(200, 200)
    b[0:100, 100:200] = True
    result = _dedup([_det("a", "img"), _det("b", "img")], {"a": a, "b": b})
    assert {d.id for d in result.kept} == {"a", "b"}
    assert result.dropped == 0 and result.nested_in == {}


def test_fallback_masks_are_never_deduplicated():
    # No real mask to compare when segmentation itself failed for one side
    # -- never silently drop a detection on that basis alone.
    a = _mask(50, 50)
    a[0:40, 0:40] = True
    result = _dedup([_det("a", "img"), _det("b", "img")], {"a": a, "b": a.copy()}, {"a": False, "b": True})
    assert {d.id for d in result.kept} == {"a", "b"}
    assert result.dropped == 0


# ---------------------------------------------------------------------------
# After vision: is a nested item part of the garment around it?
# ---------------------------------------------------------------------------

def _attrs(det_id, category, color, confidence=0.9, **kw):
    return Attributes(detection_id=det_id, category=category, color=color,
                      confidence=AttributeConfidence(category=0.9, color=confidence), **kw)


def test_a_hat_resting_on_a_bodysuit_stays_its_own_garment():
    attributes = {"body": _attrs("body", "bodysuit", "vit med giraffmönster"), "hat": _attrs("hat", "hat", "vit med tryck")}
    assert _parts_of_bigger_garments({"hat": "body"}, attributes, {"body", "hat"}) == set()


def test_a_big_part_in_the_same_fabric_is_dropped_as_part_of_the_garment():
    # The round-7 sleeve, read on its own as "leggings": same colour, same print.
    attributes = {"romper": _attrs("romper", "bodysuit", "brun med svarta hjärtan"),
                  "sleeve": _attrs("sleeve", "leggings", "brun med svarta hjärtan")}
    assert _parts_of_bigger_garments({"sleeve": "romper"}, attributes, {"romper", "sleeve"}) == {"sleeve"}


def test_a_nested_item_in_a_different_print_is_a_separate_garment():
    attributes = {"big": _attrs("big", "romper", "vit med blommigt mönster"), "small": _attrs("small", "bodysuit", "vit med giraffmönster")}
    assert _parts_of_bigger_garments({"small": "big"}, attributes, {"big", "small"}) == set()


def test_a_nested_item_in_a_different_colour_is_a_separate_garment():
    attributes = {"big": _attrs("big", "bodysuit", "vit"), "small": _attrs("small", "bodysuit", "gul")}
    assert _parts_of_bigger_garments({"small": "big"}, attributes, {"big", "small"}) == set()


def test_an_unreadable_nested_item_is_kept_rather_than_lost():
    attributes = {"big": _attrs("big", "bodysuit", "vit"), "small": Attributes(detection_id="small", unavailable=True)}
    assert _parts_of_bigger_garments({"small": "big"}, attributes, {"big", "small"}) == set()


def test_nothing_is_merged_into_a_parent_that_was_itself_dropped():
    attributes = {"big": _attrs("big", "bodysuit", "vit"), "small": _attrs("small", "bodysuit", "vit")}
    assert _parts_of_bigger_garments({"small": "big"}, attributes, {"small"}) == set()


def test_barely_touching_masks_stay_below_threshold():
    a = _mask(100, 100)
    a[0:50, 0:50] = True  # area 2500
    b = _mask(100, 100)
    b[0:50, 49:99] = True  # overlaps only column 49 -> 50 px shared
    detections = [_det("d0", "img"), _det("d1", "img")]
    overlapping = _overlapping_ids(detections, {"d0": a, "d1": b})
    assert overlapping == set()


# ---------------------------------------------------------------------------
# Cover-image selection across a garment's matched photos. Product images
# are always the seller's own photo (client decision 2026-09-25): the choice
# is only *which* photo, never whether to show an AI-edited version.
# ---------------------------------------------------------------------------

def test_cover_is_always_the_sellers_own_crop():
    prepared_by_id = {"d0": _prepared("d0", "img1", quality=_quality())}
    garment = _attach_images(_garment("g1", ["d0"]), prepared_by_id)
    assert garment.display_image == "crops/d0.jpg"
    assert all(v.display_kind == "original" and v.display == v.crop for v in garment.image_variants)


def test_among_several_photos_picks_the_most_fully_visible_one():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", quality=_quality(extent_x=0.6, extent_y=0.6)),
        "d1": _prepared("d1", "img2", quality=_quality(extent_x=0.95, extent_y=0.95)),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "crops/d1.jpg"


def test_prefers_an_unoccluded_photo_over_upload_order():
    prepared_by_id = {
        # Uploaded first, but another garment lies partly on top of it here.
        "d0": _prepared("d0", "img1", occluded=True, quality=_quality(extent_x=0.95, extent_y=0.95)),
        "d1": _prepared("d1", "img2", quality=_quality(extent_x=0.8, extent_y=0.8)),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "crops/d1.jpg"
    assert garment.match_status == MatchStatus.HIGH_CONFIDENCE


def test_garment_flagged_for_review_when_only_occluded_photos_exist():
    prepared_by_id = {"d0": _prepared("d0", "img1", occluded=True, quality=_quality())}
    garment = _attach_images(_garment("g1", ["d0"], status=MatchStatus.HIGH_CONFIDENCE), prepared_by_id)
    assert garment.match_status == MatchStatus.NEEDS_REVIEW


def test_garment_not_flagged_when_it_was_seen_unoccluded_somewhere():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", occluded=True, quality=_quality()),
        "d1": _prepared("d1", "img2", quality=_quality()),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"], status=MatchStatus.HIGH_CONFIDENCE), prepared_by_id)
    assert garment.match_status == MatchStatus.HIGH_CONFIDENCE


# ---------------------------------------------------------------------------
# Garment fragments: a limb the parent's own mask missed
# ---------------------------------------------------------------------------
# Measured on the client's real batch (job 41bb29a0f748, photo 01_2972): a
# brown romper's sleeve was boxed separately, SAM2 left it out of the
# romper's mask, and it shipped as its own "Strumpbyxor" listing. The
# numbers below mirror that pair: mask fully inside the parent's box, tiny
# relative area, and only a sliver of mask-to-mask contact.


def test_a_limb_left_out_of_the_parent_mask_is_dropped_as_a_fragment():
    parent_mask = _mask(200, 200)
    parent_mask[40:180, 20:180] = True          # the romper's body
    fragment_mask = _mask(200, 200)
    fragment_mask[20:45, 30:50] = True          # the sleeve, only touching the body's top edge
    detections = [
        _det("parent", "img", confidence=0.7, bbox=BBox(x1=20, y1=15, x2=180, y2=180)),
        _det("fragment", "img", confidence=0.95, bbox=BBox(x1=28, y1=18, x2=52, y2=48)),
    ]
    result = _dedup(detections, {"parent": parent_mask, "fragment": fragment_mask})
    # Dropped despite the detector being *more* confident about the sleeve.
    assert [d.id for d in result.kept] == ["parent"]
    assert result.dropped == 1


def test_a_separate_small_garment_lying_inside_a_bigger_ones_box_is_kept():
    # A sock resting on a spread-out blanket: its mask is entirely within
    # the blanket's box, but the two share no fabric, so it is a real
    # second garment and must survive.
    blanket = _mask(200, 200)
    blanket[10:190, 10:190] = True
    blanket[80:110, 80:110] = False             # the sock's own pixels are not the blanket's
    sock = _mask(200, 200)
    sock[80:110, 80:110] = True
    detections = [
        _det("blanket", "img", bbox=BBox(x1=10, y1=10, x2=190, y2=190)),
        _det("sock", "img", bbox=BBox(x1=80, y1=80, x2=110, y2=110)),
    ]
    result = _dedup(detections, {"blanket": blanket, "sock": sock})
    assert {d.id for d in result.kept} == {"blanket", "sock"}
    assert result.dropped == 0 and result.nested_in == {}


def test_a_neighbouring_garment_only_partly_inside_the_box_is_kept():
    # The closest real pair measured on the client's photos sat at 0.44 of
    # the smaller mask inside the bigger box -- well under the threshold.
    big = _mask(200, 200)
    big[0:100, 0:200] = True
    neighbour = _mask(200, 200)
    neighbour[80:140, 0:100] = True             # straddles the boundary, ~1/3 inside
    detections = [
        _det("big", "img", bbox=BBox(x1=0, y1=0, x2=200, y2=100)),
        _det("neighbour", "img", bbox=BBox(x1=0, y1=80, x2=100, y2=140)),
    ]
    result = _dedup(detections, {"big": big, "neighbour": neighbour})
    assert {d.id for d in result.kept} == {"big", "neighbour"}


def test_mask_inside_box_fraction_is_measured_against_the_box_not_the_mask():
    mask = _mask(100, 100)
    mask[10:20, 10:20] = True
    fully_inside = _det("p", "img", bbox=BBox(x1=0, y1=0, x2=50, y2=50))
    half_inside = _det("p", "img", bbox=BBox(x1=0, y1=0, x2=50, y2=15))
    outside = _det("p", "img", bbox=BBox(x1=60, y1=60, x2=90, y2=90))
    assert _mask_inside_box_fraction(mask, fully_inside) == 1.0
    assert _mask_inside_box_fraction(mask, half_inside) == 0.5
    assert _mask_inside_box_fraction(mask, outside) == 0.0
    assert _mask_inside_box_fraction(_mask(100, 100), fully_inside) == 0.0
