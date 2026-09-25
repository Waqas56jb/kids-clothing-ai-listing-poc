from __future__ import annotations

import re
from itertools import combinations

import numpy as np

from ai_engine.assignment import min_cost_assignment
from ai_engine.config import SETTINGS
from ai_engine.embeddings import cosine_similarity
from ai_engine.schemas import AttributeConfidence, Attributes, Detection, Garment, MatchStatus

# Tunable signal weights for the pairwise match score. Embedding similarity
# carries the most weight since it's the only signal that works even when
# attribute extraction is unavailable (no OpenAI key); structured attributes
# and OCR text add corroborating/contradicting evidence on top of it.
WEIGHTS = {
    "embedding": 0.55,
    "color": 0.15,
    "brand": 0.15,
    "size": 0.10,
    "ocr": 0.05,
}

# Above this raw embedding similarity, two crops look near-identical enough
# that "same physical item" and "two identical separate items" become
# genuinely hard to tell apart (Section 20 of the brief) -- worth flagging
# even when every other signal says "merge".
IDENTICAL_LOOK_ALIKE_EMBEDDING_SIM = 0.95

# Swedish + English color words -> canonical family. Two garments whose
# *primary* colors confidently disagree (white vs pink) are never the same
# physical item, no matter how similar two H&M bodysuits look to CLIP.
_COLOR_FAMILIES = {
    "white": ["vit", "vita", "white", "cream", "kräm", "krämvit", "offwhite", "off-white", "ecru", "naturvit"],
    "black": ["svart", "svarta", "black"],
    "grey": ["grå", "gra", "grey", "gray", "gråmelerad", "ljusgrå", "mörkgrå", "antracit"],
    "blue": ["blå", "bla", "blue", "ljusblå", "mörkblå", "marinblå", "marin", "navy", "denim", "jeansblå", "turkos", "turquoise", "petrol"],
    "red": ["röd", "rod", "red", "vinröd", "burgundy", "bordeaux", "korall", "coral"],
    "pink": ["rosa", "pink", "ljusrosa", "mörkrosa", "cerise", "fuchsia", "magenta"],
    "purple": ["lila", "purple", "violett", "lavendel", "lavender", "plommon"],
    "green": ["grön", "gron", "green", "ljusgrön", "mörkgrön", "mint", "oliv", "olive", "khaki", "lime"],
    "yellow": ["gul", "gula", "yellow", "senap", "mustard", "citron"],
    "orange": ["orange", "brandgul", "aprikos", "apricot", "persika", "peach"],
    "brown": ["brun", "bruna", "brown", "camel", "kamel", "taupe", "rost", "rust", "terrakotta"],
    "beige": ["beige", "ljusbeige", "sand", "sandfärgad", "havre", "oat"],
}
_COLOR_LOOKUP = {word: family for family, words in _COLOR_FAMILIES.items() for word in words}
_MULTI_WORDS = {"flerfärgad", "flerfärgat", "multicolor", "multicolour", "multi", "mönstrad", "mönstrat", "randig", "randigt", "rutig", "blommig", "printed"}


# The vision model names the same baby garment differently from photo to
# photo -- measured on one client batch: a muslin romper was "romper" in two
# photos and "bodysuit" in the third, and one pair of footed pants came back
# as "trousers", "sleeper" and "leggings". A strict category veto split each
# into several listings, and the romper's orphaned photo was then matched
# into a *different* garment's listing. Categories sharing a group never veto
# each other; colour and print still do.
_CATEGORY_GROUPS = (
    frozenset({"bodysuit", "onesie", "romper", "sleeper", "pajamas"}),
    frozenset({"trousers", "jeans", "leggings", "tights", "overalls", "sleeper", "pajamas"}),
    frozenset({"t-shirt", "top", "shirt", "blouse"}),
    frozenset({"sweater", "sweatshirt", "hoodie", "cardigan", "top"}),
    frozenset({"jacket", "coat", "vest"}),
    frozenset({"dress", "skirt"}),
    frozenset({"hat", "beanie"}),
    frozenset({"socks", "tights"}),
)
_WILDCARD_CATEGORIES = {None, "unknown", "other"}


def categories_compatible(a: str | None, b: str | None) -> bool:
    a, b = _normalize(a), _normalize(b)
    if a in _WILDCARD_CATEGORIES or b in _WILDCARD_CATEGORIES or a == b:
        return True
    return any(a in group and b in group for group in _CATEGORY_GROUPS)


# Print/motif words in the vision model's Swedish colour text. Two garments
# whose prints are both named and share nothing (giraffes vs flowers) are not
# the same garment even when both are "white" -- which is how a floral
# romper's photo ended up in a giraffe bodysuit's listing. Generic words
# ("tryck", "mönster", "djurmotiv") name no specific print and never veto.
_MOTIF_PREFIXES = {
    "giraffe": ("giraff",),
    "bear": ("björn", "bjorn", "nalle", "teddy"),
    "heart": ("hjärt", "hjart"),
    "dots": ("prick", "polka"),
    "floral": ("blom", "rosor", "rosmönst", "floral"),
    "stripes": ("rand", "ränd"),
    "checks": ("rutig", "rutor", "rutmönst", "rutad"),
    "stars": ("stjärn",),
    "dinosaur": ("dinosaur", "dino"),
    "rabbit": ("kanin",),
    "fox": ("räv",),
    "cat": ("katt",),
    "dog": ("hund",),
    "elephant": ("elefant",),
    "rainbow": ("regnbåg",),
}


_ANIMAL_MOTIFS = frozenset({"giraffe", "bear", "dinosaur", "rabbit", "fox", "cat", "dog", "elephant"})
# "djurmotiv"/"djurtryck" names no particular animal, but is still never a
# floral, dotted or striped print.
_GENERIC_ANIMAL_PREFIXES = ("djur", "animal")


def motifs(text: str | None) -> frozenset[str]:
    """Named prints in a colour description; a print that is only "some
    animal" comes back as {"animal"}."""
    if not text:
        return frozenset()
    found = set()
    generic_animal = False
    for word in re.findall(r"[a-zåäöéü]+", text.lower()):
        if word.startswith(_GENERIC_ANIMAL_PREFIXES):
            generic_animal = True
        for motif, prefixes in _MOTIF_PREFIXES.items():
            if word.startswith(prefixes):
                found.add(motif)
    if generic_animal and not (found & _ANIMAL_MOTIFS):
        found.add("animal")
    return frozenset(found)


def motifs_compatible(a: frozenset[str], b: frozenset[str]) -> bool:
    """True unless both name a print and nothing they name can be the same."""
    if not a or not b or a & b:
        return True
    if "animal" in a and b & _ANIMAL_MOTIFS or "animal" in b and a & _ANIMAL_MOTIFS:
        return True
    return False


# Cream/beige reads as "vit" in daylight and "beige" in a warmer, darker shot
# of the very same garment (measured: one dotted knot hat, three photos).
_BRIDGED_COLORS = {frozenset({"beige", "white"}), frozenset({"beige", "brown"})}


def colors_compatible(family_a: str | None, family_b: str | None) -> bool:
    if not family_a or not family_b or family_a == family_b:
        return True
    return frozenset({family_a, family_b}) in _BRIDGED_COLORS


def primary_color(text: str | None) -> str | None:
    """Canonical color family of the first color word in a free-text color,
    or None when unknown / multicolored (which never vetoes)."""
    if not text:
        return None
    words = re.findall(r"[a-zåäöéü\-]+", text.lower())
    for word in words:
        if word in _MULTI_WORDS:
            return None
        if word in _COLOR_LOOKUP:
            return _COLOR_LOOKUP[word]
        # compounds like "ljusblå", "mörkgrön"
        for base, family in _COLOR_LOOKUP.items():
            if len(base) >= 3 and word.endswith(base):
                return family
    return None


def _normalize(value: str | None) -> str | None:
    return value.strip().lower() if value else None


def _field_score(a: str | None, b: str | None) -> float:
    """1.0 same, 0.0 different, 0.5 neutral when either side is unknown."""
    norm_a, norm_b = _normalize(a), _normalize(b)
    if norm_a is None or norm_b is None:
        return 0.5
    return 1.0 if norm_a == norm_b else 0.0


def _color_score(a: str | None, b: str | None) -> float:
    # The same print named in both ("blommig" / "vit med blommigt mönster")
    # is strong agreement even when the wording differs.
    motifs_a, motifs_b = motifs(a), motifs(b)
    if motifs_a and motifs_b and motifs_compatible(motifs_a, motifs_b):
        return 1.0
    family_a, family_b = primary_color(a), primary_color(b)
    if family_a and family_b:
        if family_a == family_b:
            return 1.0
        return 0.75 if colors_compatible(family_a, family_b) else 0.0
    return _field_score(a, b)


def _ocr_score(texts_a: list[str], texts_b: list[str]) -> float:
    set_a = {t.strip().lower() for t in texts_a if t.strip()}
    set_b = {t.strip().lower() for t in texts_b if t.strip()}
    if not set_a or not set_b:
        return 0.5
    union = set_a | set_b
    return len(set_a & set_b) / len(union) if union else 0.5


def is_vetoed(attr_a: Attributes, attr_b: Attributes) -> bool:
    """Two detections can never be the same physical garment if their
    categories are incompatible (a jacket is never a trouser -- but a
    "romper" and a "bodysuit" may well be one garment), their primary colors
    confidently disagree (a white bodysuit is never a pink one), or both
    name a print and the prints share nothing (giraffes are never flowers)."""
    if not categories_compatible(attr_a.category, attr_b.category):
        return True
    return appearance_differs(attr_a, attr_b)


def appearance_differs(attr_a: Attributes, attr_b: Attributes) -> bool:
    """Confidently different fabric: incompatible colours, or two named
    prints with nothing in common."""
    if attr_a.confidence.color < 0.5 or attr_b.confidence.color < 0.5:
        return False
    if not colors_compatible(primary_color(attr_a.color), primary_color(attr_b.color)):
        return True
    return not motifs_compatible(motifs(attr_a.color), motifs(attr_b.color))


def fields_all_match_and_known(attr_a: Attributes, attr_b: Attributes) -> bool:
    for field in ("color", "brand", "size"):
        val_a, val_b = getattr(attr_a, field), getattr(attr_b, field)
        if val_a is None or val_b is None:
            return False
        if _normalize(val_a) != _normalize(val_b):
            return False
    return True


def pairwise_score(
    attr_a: Attributes,
    attr_b: Attributes,
    emb_a: np.ndarray,
    emb_b: np.ndarray,
    ocr_a: list[str],
    ocr_b: list[str],
) -> float:
    # With no attributes on one side the category/color veto cannot fire and
    # the score is CLIP similarity plus neutral 0.5s -- which merged a pair of
    # leggings with a bodysuit at 0.877 embedding similarity. Two separate
    # listings the seller can merge beat one wrong one.
    if attr_a.unavailable or attr_b.unavailable:
        return 0.0
    if is_vetoed(attr_a, attr_b):
        return 0.0

    embedding_sim = cosine_similarity(emb_a, emb_b)
    return (
        WEIGHTS["embedding"] * embedding_sim
        + WEIGHTS["color"] * _color_score(attr_a.color, attr_b.color)
        + WEIGHTS["brand"] * _field_score(attr_a.brand, attr_b.brand)
        + WEIGHTS["size"] * _field_score(attr_a.size, attr_b.size)
        + WEIGHTS["ocr"] * _ocr_score(ocr_a, ocr_b)
    )


def _pick_best_field(members: list[Attributes], field: str) -> tuple[str | None, float]:
    best_value, best_confidence = None, 0.0
    for attr in members:
        value = getattr(attr, field)
        confidence = getattr(attr.confidence, field)
        if value is not None and confidence >= best_confidence:
            best_value, best_confidence = value, confidence
    return best_value, best_confidence


def _merge_defects(members: list[Attributes]) -> str | None:
    """Surface a defect if *any* photo of this garment caught one.

    A tear or stain can be visible from one angle and hidden from another --
    trusting only the "best" single photo (like every other field) would let
    a clean-looking angle mask damage a different photo clearly shows.
    """
    seen: list[str] = []
    for attr in members:
        if attr.defects and attr.defects not in seen:
            seen.append(attr.defects)
    return "; ".join(seen) if seen else None


def _assemble_garment(
    garment_index: int,
    member_ids: list[str],
    detections_by_id: dict[str, Detection],
    attributes: dict[str, Attributes],
    embeddings: dict[str, np.ndarray],
    pair_scores: dict[frozenset[str], float],
) -> Garment:
    members = [attributes[det_id] for det_id in member_ids]
    images = sorted({detections_by_id[det_id].image_id for det_id in member_ids})

    category, category_conf = _pick_best_field(members, "category")
    brand, brand_conf = _pick_best_field(members, "brand")
    size, size_conf = _pick_best_field(members, "size")
    color, color_conf = _pick_best_field(members, "color")
    condition, condition_conf = _pick_best_field(members, "condition")
    gender, gender_conf = _pick_best_field(members, "gender")
    defects = _merge_defects(members)
    if defects and condition != "damaged":
        condition = "damaged"

    confidence = AttributeConfidence(
        category=category_conf,
        brand=brand_conf,
        size=size_conf,
        color=color_conf,
        condition=condition_conf,
        gender=gender_conf,
    )

    if len(member_ids) == 1:
        match_confidence = 1.0
        status = MatchStatus.HIGH_CONFIDENCE
    else:
        pairs = list(combinations(member_ids, 2))
        scores = [pair_scores[frozenset(pair)] for pair in pairs]
        match_confidence = sum(scores) / len(scores)

        max_embedding_sim = max(
            cosine_similarity(embeddings[a], embeddings[b]) for a, b in pairs
        )
        any_pair_identical_looking = any(
            fields_all_match_and_known(attributes[a], attributes[b]) for a, b in pairs
        )

        if match_confidence >= SETTINGS.match_merge_threshold:
            if max_embedding_sim >= IDENTICAL_LOOK_ALIKE_EMBEDDING_SIM and any_pair_identical_looking:
                status = MatchStatus.NEEDS_REVIEW
            else:
                status = MatchStatus.HIGH_CONFIDENCE
        elif match_confidence >= SETTINGS.match_review_threshold:
            status = MatchStatus.MEDIUM_CONFIDENCE
        else:
            status = MatchStatus.NEEDS_REVIEW

    if any(member.unavailable for member in members):
        status = MatchStatus.NEEDS_REVIEW

    return Garment(
        id=f"garment_{garment_index:03d}",
        category=category or "unknown",
        brand=brand,
        size=size,
        color=color,
        condition=condition,
        gender=gender,
        defects=defects,
        confidence=confidence,
        images=images,
        detection_ids=sorted(member_ids),
        match_confidence=round(match_confidence, 4),
        match_status=status,
    )


def build_garments(
    detections: list[Detection],
    attributes: dict[str, Attributes],
    embeddings: dict[str, np.ndarray],
    ocr_texts: dict[str, list[str]],
) -> list[Garment]:
    """Cluster detections into physical garments and assemble final records.

    A detection joins a cluster only if it matches *every* member above the
    review threshold (and no pair is vetoed) -- single-link chaining (A~B,
    B~C therefore A=C) is how three different bodysuits once collapsed into
    one garment. Clusters that form below the merge threshold, or that look
    like two separate-but-identical items, are flagged for seller review
    rather than silently merged or silently split.
    """
    detections_by_id = {d.id: d for d in detections}
    ids = [d.id for d in detections]
    pair_scores: dict[frozenset[str], float] = {}

    for id_a, id_b in combinations(ids, 2):
        # A single photo shows each physical item once. Two detections from
        # the *same* image are two different pieces of clothing laid near
        # each other, never "the same garment seen twice" -- that scenario
        # only exists across different photos.
        if detections_by_id[id_a].image_id == detections_by_id[id_b].image_id:
            pair_scores[frozenset((id_a, id_b))] = 0.0
            continue
        pair_scores[frozenset((id_a, id_b))] = pairwise_score(
            attributes[id_a],
            attributes[id_b],
            embeddings[id_a],
            embeddings[id_b],
            ocr_texts.get(id_a, []),
            ocr_texts.get(id_b, []),
        )

    image_of = {det_id: detections_by_id[det_id].image_id for det_id in ids}
    clusters = cluster_across_photos(ids, image_of, pair_scores, SETTINGS.match_review_threshold)

    return [
        _assemble_garment(index, member_ids, detections_by_id, attributes, embeddings, pair_scores)
        for index, member_ids in enumerate(clusters, start=1)
    ]


def _cluster_score(cluster: list[str], pair_scores: dict[frozenset[str], float]) -> float:
    return sum(pair_scores[frozenset(pair)] for pair in combinations(cluster, 2))


def _assign_in_order(
    photo_order: list[str],
    ids_by_photo: dict[str, list[str]],
    pair_scores: dict[frozenset[str], float],
    threshold: float,
) -> list[list[str]]:
    clusters: list[list[str]] = []
    for photo in photo_order:
        new = ids_by_photo[photo]
        if not new:
            continue
        # Rows: this photo's detections. Columns: every existing cluster,
        # then one "starts its own garment" slot per detection (cost 0).
        # A cluster is only allowed when the detection clears the threshold
        # against *every* member; its cost is minus the average score.
        blocked = 1e6
        cost = []
        for det_id in new:
            row = []
            for cluster in clusters:
                scores = [pair_scores[frozenset((det_id, member))] for member in cluster]
                row.append(-sum(scores) / len(scores) if min(scores) >= threshold else blocked)
            row.extend([0.0] * len(new))
            cost.append(row)
        for row_index, column in enumerate(min_cost_assignment(cost)):
            det_id = new[row_index]
            if column < len(clusters) and cost[row_index][column] < 0:
                clusters[column].append(det_id)
            else:
                clusters.append([det_id])
    return clusters


def cluster_across_photos(
    ids: list[str],
    image_of: dict[str, str],
    pair_scores: dict[frozenset[str], float],
    threshold: float,
) -> list[list[str]]:
    """Group detections into physical garments, at most one per photo.

    Each photo's detections are assigned to the garments found so far *all
    at once* (optimal assignment), not one best pair at a time. Measured on
    a client pile with two white floral pieces: the greedy best-pair-first
    clusterer met an exact tie (0.790 / 0.790) for the third photo, took
    the wrong one first and swapped the two garments' photos, while the
    joint assignment of that photo scored the correct pairing highest.
    Every photo is tried as the starting point; the grouping with the
    highest total similarity wins, so the result does not depend on the
    order the seller uploaded in."""
    photos = list(dict.fromkeys(image_of[det_id] for det_id in ids))
    ids_by_photo = {photo: [det_id for det_id in ids if image_of[det_id] == photo] for photo in photos}
    best: list[list[str]] | None = None
    best_score = -1.0
    for start in photos:
        order = [start] + [photo for photo in photos if photo != start]
        clusters = _assign_in_order(order, ids_by_photo, pair_scores, threshold)
        total = sum(_cluster_score(cluster, pair_scores) for cluster in clusters)
        if total > best_score + 1e-9:
            best, best_score = clusters, total
    position = {det_id: index for index, det_id in enumerate(ids)}
    grouped = [sorted(cluster, key=position.__getitem__) for cluster in best or []]
    return sorted(grouped, key=lambda cluster: position[cluster[0]])
