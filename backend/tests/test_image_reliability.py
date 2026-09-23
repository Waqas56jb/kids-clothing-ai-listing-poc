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
    _downgrade_if_ai_flagged_incomplete,
    _drop_duplicate_detections,
    _mask_inside_box_fraction,
    _mask_overlap_fraction,
    _overlapping_ids,
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


def _prepared(det_id: str, image_id: str, *, display_kind: str, rejected_reason: str | None, quality: MaskQuality, confidence: float = 0.9) -> _Prepared:
    det = _det(det_id, image_id, confidence)
    images = DetectionImages(
        detection_id=det_id,
        image_id=image_id,
        original=f"originals/{image_id}.jpg",
        crop=f"crops/{det_id}.jpg",
        cutout=f"cutouts/{det_id}.png" if display_kind == "cutout" else None,
        display=f"cutouts/{det_id}.png" if display_kind == "cutout" else f"crops/{det_id}.jpg",
        display_kind=display_kind,
        cutout_rejected_reason=rejected_reason,
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


def test_nearly_fully_nested_detection_is_dropped_as_a_duplicate():
    # A tight sub-crop of the same physical garment (e.g. a different prompt
    # phrase matching just the collar/torso) whose mask is almost entirely
    # inside the bigger, more-confident detection's mask -- this is the
    # real failure mode empirically observed on an ordinary solo photo: the
    # detector fired twice on one garment and, left alone, each box would
    # have become its own "garment" in the results.
    big = _mask(200, 200)
    big[0:150, 0:150] = True  # area 22500
    small = _mask(200, 200)
    small[10:100, 10:100] = True  # area 8100, fully inside `big`
    detections = [_det("big", "img", confidence=0.9), _det("small", "img", confidence=0.7)]
    kept, notes = _drop_duplicate_detections(detections, {"big": big, "small": small}, {"big": False, "small": False})
    assert [d.id for d in kept] == ["big"]
    assert notes and "dubblett" in notes[0].lower()


def test_two_different_garments_with_overlapping_boxes_are_not_treated_as_duplicates():
    # Two genuinely different garments (e.g. pants photographed overlapping
    # a shirt) whose *boxes* overlap a lot but whose actual segmented
    # fabric shares no pixels at all -- must never be collapsed into one.
    a = _mask(200, 200)
    a[0:100, 0:100] = True
    b = _mask(200, 200)
    b[0:100, 100:200] = True  # touches `a`'s box region but shares no mask pixels
    detections = [_det("a", "img"), _det("b", "img")]
    kept, notes = _drop_duplicate_detections(detections, {"a": a, "b": b}, {"a": False, "b": False})
    assert {d.id for d in kept} == {"a", "b"}
    assert notes == []


def test_duplicate_detection_keeps_the_more_confident_one_even_if_smaller():
    big_low_conf = _mask(200, 200)
    big_low_conf[0:150, 0:150] = True
    small_high_conf = _mask(200, 200)
    small_high_conf[10:100, 10:100] = True
    detections = [_det("big", "img", confidence=0.3), _det("small", "img", confidence=0.95)]
    kept, _ = _drop_duplicate_detections(
        detections, {"big": big_low_conf, "small": small_high_conf}, {"big": False, "small": False}
    )
    assert [d.id for d in kept] == ["small"]


def test_fallback_masks_are_never_deduplicated():
    # No real mask to compare when segmentation itself failed for one side
    # -- never silently drop a detection on that basis alone.
    a = _mask(50, 50)
    a[0:40, 0:40] = True
    detections = [_det("a", "img"), _det("b", "img")]
    kept, notes = _drop_duplicate_detections(detections, {"a": a, "b": a.copy()}, {"a": False, "b": True})
    assert {d.id for d in kept} == {"a", "b"}
    assert notes == []


def test_barely_touching_masks_stay_below_threshold():
    a = _mask(100, 100)
    a[0:50, 0:50] = True  # area 2500
    b = _mask(100, 100)
    b[0:50, 49:99] = True  # overlaps only column 49 -> 50 px shared
    detections = [_det("d0", "img"), _det("d1", "img")]
    overlapping = _overlapping_ids(detections, {"d0": a, "d1": b})
    assert overlapping == set()


# ---------------------------------------------------------------------------
# Cover-image selection across a garment's matched photos
# ---------------------------------------------------------------------------

def test_prefers_a_clean_cutout_over_a_fallback_original():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="mask_cut_off_garment", quality=_quality()),
        "d1": _prepared("d1", "img2", display_kind="cutout", rejected_reason=None, quality=_quality()),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "cutouts/d1.png"
    assert garment.match_status == MatchStatus.HIGH_CONFIDENCE


def test_among_several_clean_cutouts_picks_the_most_fully_visible_one():
    prepared_by_id = {
        # A narrower/partially-cut view still passed the quality gate, but a
        # fuller view of the same garment from a second photo exists too.
        "d0": _prepared("d0", "img1", display_kind="cutout", rejected_reason=None, quality=_quality(extent_x=0.6, extent_y=0.6)),
        "d1": _prepared("d1", "img2", display_kind="cutout", rejected_reason=None, quality=_quality(extent_x=0.95, extent_y=0.95)),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "cutouts/d1.png"


def test_when_no_cutout_available_picks_the_least_occluded_original_not_upload_order():
    prepared_by_id = {
        # Uploaded first, but this photo's garment overlaps another one.
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="overlaps_other_garment", quality=_quality(extent_x=0.3, extent_y=0.9)),
        # Uploaded second, no overlap, just a mediocre mask -- a clearer,
        # more honest photo of the garment even without a clean cutout.
        "d1": _prepared("d1", "img2", display_kind="original", rejected_reason="mask_has_holes", quality=_quality(extent_x=0.9, extent_y=0.9)),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "crops/d1.jpg"


def test_garment_flagged_for_review_when_only_overlapping_photos_exist():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="overlaps_other_garment", quality=_quality()),
    }
    garment = _attach_images(_garment("g1", ["d0"], status=MatchStatus.HIGH_CONFIDENCE), prepared_by_id)
    assert garment.match_status == MatchStatus.NEEDS_REVIEW


def test_garment_not_flagged_when_fallback_is_unrelated_to_overlap():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="mask_has_holes", quality=_quality()),
    }
    garment = _attach_images(_garment("g1", ["d0"], status=MatchStatus.HIGH_CONFIDENCE), prepared_by_id)
    assert garment.match_status == MatchStatus.HIGH_CONFIDENCE


# ---------------------------------------------------------------------------
# Vision-judged cutout completeness (real messy-pile photos showed masks
# that pass every geometric check -- decent coverage, no enclosed holes,
# wide extent -- yet still look torn or missing a visible chunk to a human;
# no shape/color heuristic tried caught this without also flagging plenty
# of genuinely fine cutouts, so the model that already looks at both images
# is asked to judge its own cutout directly).
# ---------------------------------------------------------------------------

def test_ai_flagged_cutout_is_downgraded_to_the_original_photo():
    prepared = _prepared("d0", "img1", display_kind="cutout", rejected_reason=None, quality=_quality())
    attrs = Attributes(detection_id="d0", category="dress", cutout_looks_complete=False)
    _downgrade_if_ai_flagged_incomplete(prepared, attrs)
    assert prepared.images.display_kind == "original"
    assert prepared.images.display == prepared.images.crop
    assert prepared.images.cutout_rejected_reason == "ai_flagged_incomplete"


def test_ai_approved_cutout_is_left_alone():
    prepared = _prepared("d0", "img1", display_kind="cutout", rejected_reason=None, quality=_quality())
    attrs = Attributes(detection_id="d0", category="dress", cutout_looks_complete=True)
    _downgrade_if_ai_flagged_incomplete(prepared, attrs)
    assert prepared.images.display_kind == "cutout"
    assert prepared.images.cutout_rejected_reason is None


def test_null_judgment_never_downgrades_a_cutout():
    # No cutout was shown to the model (or the call failed) -- absence of a
    # verdict must never be treated as a negative one.
    prepared = _prepared("d0", "img1", display_kind="cutout", rejected_reason=None, quality=_quality())
    attrs = Attributes(detection_id="d0", category="dress", cutout_looks_complete=None)
    _downgrade_if_ai_flagged_incomplete(prepared, attrs)
    assert prepared.images.display_kind == "cutout"


def test_ai_flag_never_touches_a_detection_that_was_already_showing_the_original():
    prepared = _prepared("d0", "img1", display_kind="original", rejected_reason="mask_has_holes", quality=_quality())
    attrs = Attributes(detection_id="d0", category="dress", cutout_looks_complete=False)
    _downgrade_if_ai_flagged_incomplete(prepared, attrs)
    assert prepared.images.cutout_rejected_reason == "mask_has_holes"  # untouched, not overwritten


def test_ai_flagged_incomplete_forces_needs_review_like_overlap_does():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="ai_flagged_incomplete", quality=_quality()),
    }
    garment = _attach_images(_garment("g1", ["d0"], status=MatchStatus.HIGH_CONFIDENCE), prepared_by_id)
    assert garment.match_status == MatchStatus.NEEDS_REVIEW


def test_cover_selection_prefers_an_untouched_cutout_over_an_ai_flagged_one():
    prepared_by_id = {
        "d0": _prepared("d0", "img1", display_kind="original", rejected_reason="ai_flagged_incomplete", quality=_quality(extent_x=0.95, extent_y=0.95)),
        "d1": _prepared("d1", "img2", display_kind="cutout", rejected_reason=None, quality=_quality(extent_x=0.6, extent_y=0.6)),
    }
    garment = _attach_images(_garment("g1", ["d0", "d1"]), prepared_by_id)
    assert garment.display_image == "cutouts/d1.png"


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
    kept, notes = _drop_duplicate_detections(
        detections, {"parent": parent_mask, "fragment": fragment_mask}, {"parent": False, "fragment": False}
    )
    # Dropped despite the detector being *more* confident about the sleeve.
    assert [d.id for d in kept] == ["parent"]
    assert notes and "dubblett" in notes[0].lower()


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
    kept, notes = _drop_duplicate_detections(
        detections, {"blanket": blanket, "sock": sock}, {"blanket": False, "sock": False}
    )
    assert {d.id for d in kept} == {"blanket", "sock"}
    assert notes == []


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
    kept, _ = _drop_duplicate_detections(
        detections, {"big": big, "neighbour": neighbour}, {"big": False, "neighbour": False}
    )
    assert {d.id for d in kept} == {"big", "neighbour"}


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
