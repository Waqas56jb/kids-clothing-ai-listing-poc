"""Matching rules measured on the client's 3-photo pile of 9 garments
(job 4a821ef35d56, 2026-09-25): per-detection descriptions below are the
vision model's own, verbatim."""
from __future__ import annotations

import itertools

import numpy as np

from ai_engine.matching import build_garments, categories_compatible, is_vetoed
from ai_engine.schemas import AttributeConfidence, Attributes, BBox, Detection


def det(det_id: str) -> Detection:
    return Detection(id=det_id, image_id=det_id.split("_")[0], bbox=BBox(x1=0, y1=0, x2=10, y2=10), detector_confidence=0.9)


def attrs(det_id: str, category: str, color: str, size: str | None = None) -> Attributes:
    return Attributes(
        detection_id=det_id, category=category, color=color, size=size,
        confidence=AttributeConfidence(category=0.9, color=0.9),
    )


def test_the_same_romper_called_bodysuit_in_one_photo_can_still_match():
    assert not is_vetoed(attrs("a", "romper", "vit med blommigt mönster"), attrs("b", "bodysuit", "vit med blommigt mönster"))


def test_footed_pants_named_three_ways_can_still_match():
    names = ["trousers", "sleeper", "leggings"]
    for x in names:
        for y in names:
            assert categories_compatible(x, y)


def test_a_giraffe_print_never_matches_a_floral_one_even_in_the_same_colour():
    # The client's screenshot: a floral romper photo inside the giraffe listing.
    assert is_vetoed(attrs("a", "bodysuit", "vit med giraffmönster"), attrs("b", "bodysuit", "vit med blommigt mönster"))


def test_a_generic_animal_description_does_not_block_the_giraffe():
    assert not is_vetoed(attrs("a", "bodysuit", "vit med giraffmönster"), attrs("b", "bodysuit", "vit med djurmotiv"))


def test_the_same_cream_hat_called_white_and_beige_can_still_match():
    assert not is_vetoed(attrs("a", "hat", "vit med prickar"), attrs("b", "hat", "beige med prickar"))


def test_genuinely_different_colours_and_garment_kinds_still_veto():
    assert is_vetoed(attrs("a", "bodysuit", "vit"), attrs("b", "bodysuit", "rosa"))
    assert is_vetoed(attrs("a", "bodysuit", "vit"), attrs("b", "trousers", "vit"))
    assert is_vetoed(attrs("a", "hat", "vit"), attrs("b", "bodysuit", "vit"))
    assert is_vetoed(attrs("a", "hat", "vit med prickar"), attrs("b", "hat", "vit med ränder"))


def test_the_giraffe_and_romper_come_out_as_separate_complete_listings():
    # Photo 01's romper (called "bodysuit" there) looks more like the giraffe
    # to CLIP than to its own romper -- the old matcher put it in the
    # giraffe's listing and left photo 01's real giraffe on its own.
    close, closer = np.array([1.0, 0.0]), np.array([0.98, 0.199])
    detections = [det(x) for x in ("p0_giraffe", "p1_giraffe", "p2_giraffe", "p0_romper", "p1_romper", "p2_romper")]
    attributes = {
        "p0_giraffe": attrs("p0_giraffe", "bodysuit", "vit med giraffmönster"),
        "p1_giraffe": attrs("p1_giraffe", "bodysuit", "vit med djurmotiv"),
        "p2_giraffe": attrs("p2_giraffe", "bodysuit", "vit med giraffmönster"),
        "p0_romper": attrs("p0_romper", "romper", "vit med blommigt mönster"),
        "p1_romper": attrs("p1_romper", "bodysuit", "vit med blommigt mönster"),
        "p2_romper": attrs("p2_romper", "romper", "vit med blommigt mönster"),
    }
    embeddings = {
        "p0_giraffe": close, "p1_giraffe": closer, "p2_giraffe": close,
        "p0_romper": closer, "p1_romper": close, "p2_romper": closer,
    }
    garments = build_garments(detections, attributes, embeddings, {d.id: [] for d in detections})
    groups = sorted(tuple(sorted(g.detection_ids)) for g in garments)
    assert groups == [("p0_giraffe", "p1_giraffe", "p2_giraffe"), ("p0_romper", "p1_romper", "p2_romper")]


def test_an_unnamed_animal_print_is_never_a_floral_one_but_can_be_a_giraffe():
    assert is_vetoed(attrs("a", "bodysuit", "vit med djurmotiv"), attrs("b", "romper", "vit med blommigt mönster"))
    assert not is_vetoed(attrs("a", "bodysuit", "vit med djurmotiv"), attrs("b", "bodysuit", "vit med giraffmönster"))
    # Two named animals are still different prints.
    assert is_vetoed(attrs("a", "bodysuit", "vit med giraffmönster"), attrs("b", "bodysuit", "vit med björnmönster"))


def test_a_tied_best_pair_does_not_swap_two_garments_photos():
    # Real scores from the client's batch: photo 02's burgundy bodysuit
    # (p2_burg) and a muslin romper (p2_romp) both scored exactly 0.790
    # against photo 00's burgundy. Taking the best pair first swapped the two
    # garments' third photos; assigning photo 02 jointly does not.
    from ai_engine.matching import cluster_across_photos

    s = {
        ("p0_burg", "p1_burg"): 0.824, ("p0_romp", "p1_romp"): 0.831,
        ("p0_burg", "p1_romp"): 0.781, ("p0_romp", "p1_burg"): 0.786,
        ("p2_burg", "p0_burg"): 0.790, ("p2_burg", "p1_burg"): 0.786,
        ("p2_burg", "p0_romp"): 0.752, ("p2_burg", "p1_romp"): 0.752,
        ("p2_romp", "p0_burg"): 0.790, ("p2_romp", "p1_burg"): 0.778,
        ("p2_romp", "p0_romp"): 0.762, ("p2_romp", "p1_romp"): 0.784,
    }
    ids = ["p0_burg", "p0_romp", "p1_burg", "p1_romp", "p2_romp", "p2_burg"]
    image_of = {i: i.split("_")[0] for i in ids}
    pair_scores = {frozenset(k): v for k, v in s.items()}
    for a, b in itertools.combinations(ids, 2):
        pair_scores.setdefault(frozenset((a, b)), 0.0)
    clusters = cluster_across_photos(ids, image_of, pair_scores, 0.65)
    assert sorted(map(sorted, clusters)) == [["p0_burg", "p1_burg", "p2_burg"], ["p0_romp", "p1_romp", "p2_romp"]]


def test_clustering_never_puts_two_detections_of_one_photo_together_or_breaks_complete_linkage():
    from ai_engine.matching import cluster_across_photos

    ids = ["p0_a", "p0_b", "p1_a"]
    image_of = {i: i.split("_")[0] for i in ids}
    pair_scores = {frozenset(("p0_a", "p0_b")): 0.0, frozenset(("p0_a", "p1_a")): 0.9, frozenset(("p0_b", "p1_a")): 0.95}
    clusters = cluster_across_photos(ids, image_of, pair_scores, 0.65)
    assert all(len({image_of[i] for i in c}) == len(c) for c in clusters)
    assert len(clusters) == 2
