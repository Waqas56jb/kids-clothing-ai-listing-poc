from __future__ import annotations

import re
from itertools import combinations

import numpy as np

from ai_engine.assignment import min_cost_assignment
from ai_engine.config import SETTINGS
from ai_engine.embeddings import cosine_similarity
from ai_engine.schemas import AttributeConfidence, Attributes, Detection, Garment, MatchStatus

# Signal weights for the pairwise match score. Embedding similarity carries
# the most weight; the vision model's category is *evidence*, not a veto --
# measured on a client's 15-garment pile photographed 4 times, the same
# garment came back as "bodysuit" and "top", "dress" and "top", "trousers"
# and "sweatshirt", and a partial crop of leggings as "top": as a hard veto
# that split 8 garments and mixed 4 listings (20 listings for 15 garments).
# Colour and print, by contrast, were read the same in every photo.
WEIGHTS = {
    "embedding": 0.40,
    "measured_color": 0.15,
    "category": 0.15,
    "color": 0.15,
    "brand": 0.07,
    "size": 0.05,
    "ocr": 0.03,
}

# The garment's median colour measured from its own mask pixels (see
# ai_engine.color_signature). Distance in CIELAB with lightness counted half
# (exposure changes between photos move L most). Measured on three client
# piles: re-shots of the same garment are typically 2-6 apart (90% under
# 6.5), while the look-alikes CLIP could not separate -- a khaki vs a
# rose-brown bodysuit, sage vs light-blue, cream fruit-print leggings vs
# yellow trousers -- are 9-14 apart. A crop that is mostly a neighbour
# (mask on the cuffs only) can read 40 off, so this is weighed, never a veto.
# Used for re-shoots only (see `pairwise_score`), where every garment's
# other photos were taken in the same light.
MEASURED_COLOR_SCALE = 16.0
_LIGHTNESS_WEIGHT = 0.5

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

# The model's fallback when unsure: counts as half-agreement with anything.
_VAGUE_CATEGORIES = {"top", "accessory"}

# A hat, a sock or a mitten is never a piece of clothing of another kind;
# that is the one category disagreement that is not naming noise, so it
# still vetoes a match outright.
_ACCESSORY_KIND = {
    "hat": "head", "beanie": "head", "socks": "feet", "shoes": "feet", "mittens": "hands", "scarf": "neck",
}


def categories_compatible(a: str | None, b: str | None) -> bool:
    a, b = _normalize(a), _normalize(b)
    if a in _WILDCARD_CATEGORIES or b in _WILDCARD_CATEGORIES or a == b:
        return True
    return any(a in group and b in group for group in _CATEGORY_GROUPS)


def category_score(a: str | None, b: str | None) -> float:
    """1.0 same kind of garment, 0.5 when either is a wildcard or the vague
    "top", 0.0 when they plainly disagree (still just evidence)."""
    a, b = _normalize(a), _normalize(b)
    if a in _WILDCARD_CATEGORIES or b in _WILDCARD_CATEGORIES:
        return 0.5
    if categories_compatible(a, b):
        return 1.0
    if a in _VAGUE_CATEGORIES or b in _VAGUE_CATEGORIES:
        return 0.5
    return 0.0


def kinds_incompatible(a: str | None, b: str | None) -> bool:
    kind_a, kind_b = _ACCESSORY_KIND.get(_normalize(a) or ""), _ACCESSORY_KIND.get(_normalize(b) or "")
    return (kind_a or kind_b) is not None and kind_a != kind_b


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


# Colour families a garment can plausibly be read as in different light --
# the same dusty-pink velour trousers came back "beige" in one photo and
# "ljusrosa" in the other three. A neighbour is a partial match; anything
# further apart (pink vs blue, white vs yellow) still vetoes.
_NEIGHBOUR_COLORS = _BRIDGED_COLORS | {
    frozenset(pair)
    for pair in [("beige", "pink"), ("pink", "red"), ("pink", "purple"), ("grey", "white"), ("grey", "black"),
                 ("blue", "green"), ("yellow", "orange"), ("yellow", "beige"),
                 # A pale sage bodysuit came back "ljusgrå", "ljusgrön" and
                 # "ljusblå" in three photos; the measured colour decides.
                 ("grey", "blue"), ("grey", "green")]
}


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


def color_score(a: str | None, b: str | None) -> float | None:
    """1.0 same colour or same named print, 0.5 neighbouring colours or
    nothing to compare, None when they plainly clash."""
    motifs_a, motifs_b = motifs(a), motifs(b)
    if motifs_a and motifs_b:
        return 1.0 if motifs_compatible(motifs_a, motifs_b) else None
    family_a, family_b = primary_color(a), primary_color(b)
    if family_a and family_b:
        if family_a == family_b:
            return 1.0
        return 0.5 if frozenset({family_a, family_b}) in _NEIGHBOUR_COLORS else None
    return 0.5


def measured_color_score(color_a: np.ndarray | None, color_b: np.ndarray | None) -> float:
    """1.0 identical measured colour, falling linearly to 0.0 at
    MEASURED_COLOR_SCALE apart; 0.5 when either side has no measurement."""
    if color_a is None or color_b is None:
        return 0.5
    dl = _LIGHTNESS_WEIGHT * (float(color_a[0]) - float(color_b[0]))
    distance = (dl * dl + (float(color_a[1]) - float(color_b[1])) ** 2 + (float(color_a[2]) - float(color_b[2])) ** 2) ** 0.5
    return max(0.0, 1.0 - distance / MEASURED_COLOR_SCALE)


def _ocr_score(texts_a: list[str], texts_b: list[str]) -> float:
    set_a = {t.strip().lower() for t in texts_a if t.strip()}
    set_b = {t.strip().lower() for t in texts_b if t.strip()}
    if not set_a or not set_b:
        return 0.5
    union = set_a | set_b
    return len(set_a & set_b) / len(union) if union else 0.5


def is_vetoed(attr_a: Attributes, attr_b: Attributes) -> bool:
    """Two detections can never be the same physical garment if one is an
    accessory the other isn't (a hat is never trousers), or their colours
    or prints confidently clash (a white bodysuit is never a pink one,
    giraffes are never flowers). A category disagreement between two
    garments is weighed in the score instead -- it is too often noise."""
    if kinds_incompatible(attr_a.category, attr_b.category):
        return True
    confident = attr_a.confidence.color >= 0.5 and attr_b.confidence.color >= 0.5
    return confident and color_score(attr_a.color, attr_b.color) is None


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
    reshoot: bool = False,
    color_a: np.ndarray | None = None,
    color_b: np.ndarray | None = None,
) -> float:
    """How likely two detections in different photos are one garment.

    `reshoot` says the two photos are the same pile photographed again
    (see `_reshoot_pairs`). Only then is the vision model's category mere
    evidence and a neighbouring colour a partial match: in a re-shoot most
    garments demonstrably reappear, so the one-per-photo assignment has the
    right partner to choose. Between unrelated photos the strict rules
    apply -- a category or colour disagreement vetoes -- because there the
    look-alike is usually a *different* garment (measured: 12 different
    product photos, 5 wrong merges under the lenient rules, 0 under these).
    """
    # With no attributes on one side the only signal left is CLIP, which put
    # a pair of leggings and a bodysuit at 0.877. Two separate listings the
    # seller can merge beat one wrong one.
    if attr_a.unavailable or attr_b.unavailable:
        return 0.0
    if not reshoot:
        return _strict_score(attr_a, attr_b, emb_a, emb_b, ocr_a, ocr_b)
    if is_vetoed(attr_a, attr_b):
        return 0.0
    color = color_score(attr_a.color, attr_b.color)
    return (
        WEIGHTS["embedding"] * cosine_similarity(emb_a, emb_b)
        + WEIGHTS["measured_color"] * measured_color_score(color_a, color_b)
        + WEIGHTS["category"] * category_score(attr_a.category, attr_b.category)
        + WEIGHTS["color"] * (0.5 if color is None else color)
        + WEIGHTS["brand"] * _field_score(attr_a.brand, attr_b.brand)
        + WEIGHTS["size"] * _field_score(attr_a.size, attr_b.size)
        + WEIGHTS["ocr"] * _ocr_score(ocr_a, ocr_b)
    )


_STRICT_WEIGHTS = {"embedding": 0.55, "color": 0.15, "brand": 0.15, "size": 0.10, "ocr": 0.05}


def _strict_color_score(a: str | None, b: str | None) -> float:
    motifs_a, motifs_b = motifs(a), motifs(b)
    if motifs_a and motifs_b and motifs_compatible(motifs_a, motifs_b):
        return 1.0
    family_a, family_b = primary_color(a), primary_color(b)
    if family_a and family_b:
        if family_a == family_b:
            return 1.0
        return 0.75 if colors_compatible(family_a, family_b) else 0.0
    # Neither names a colour family: two different wordings count against.
    return _field_score(a, b)


def _strict_score(attr_a: Attributes, attr_b: Attributes, emb_a, emb_b, ocr_a, ocr_b) -> float:
    if kinds_incompatible(attr_a.category, attr_b.category) or not categories_compatible(attr_a.category, attr_b.category):
        return 0.0
    if appearance_differs(attr_a, attr_b):
        return 0.0
    return (
        _STRICT_WEIGHTS["embedding"] * cosine_similarity(emb_a, emb_b)
        + _STRICT_WEIGHTS["color"] * _strict_color_score(attr_a.color, attr_b.color)
        + _STRICT_WEIGHTS["brand"] * _field_score(attr_a.brand, attr_b.brand)
        + _STRICT_WEIGHTS["size"] * _field_score(attr_a.size, attr_b.size)
        + _STRICT_WEIGHTS["ocr"] * _ocr_score(ocr_a, ocr_b)
    )


# Two photos are the same pile photographed again when, pairing their
# garments one-to-one by appearance, several of them have an unmistakable
# partner. Measured: every photo pair of two client piles had 5-15 garments
# with a partner at >= 0.85 (71-100% of the smaller photo), while unrelated
# product photos -- 1-3 garments each -- never had more than 2.
_RESHOOT_STRONG_SIMILARITY = 0.85
_RESHOOT_MIN_PARTNERS = 3
_RESHOOT_MIN_FRACTION = 0.5


def _reshoot_pairs(ids_by_photo: dict[str, list[str]], embeddings: dict[str, np.ndarray]) -> set[frozenset[str]]:
    pairs: set[frozenset[str]] = set()
    for photo_a, photo_b in combinations(ids_by_photo, 2):
        rows, cols = sorted((ids_by_photo[photo_a], ids_by_photo[photo_b]), key=len)
        if len(rows) < _RESHOOT_MIN_PARTNERS:
            continue
        similarity = [[cosine_similarity(embeddings[r], embeddings[c]) for c in cols] for r in rows]
        assignment = min_cost_assignment([[-value for value in row] for row in similarity])
        partners = sum(1 for i, j in enumerate(assignment) if similarity[i][j] >= _RESHOOT_STRONG_SIMILARITY)
        if partners >= _RESHOOT_MIN_PARTNERS and partners / len(rows) >= _RESHOOT_MIN_FRACTION:
            pairs.add(frozenset((photo_a, photo_b)))
    return pairs


def looks_like_the_same_garment(attr_a: Attributes, attr_b: Attributes) -> bool:
    """Strict: the same kind of garment and the same colour family or the
    same named print -- for collapsing two boxes on one garment in one photo,
    where a neighbouring colour (a white and a grey pair of trousers lying
    on top of each other) must *not* count."""
    if attr_a.unavailable or attr_b.unavailable:
        return False
    if category_score(attr_a.category, attr_b.category) == 0.0 or kinds_incompatible(attr_a.category, attr_b.category):
        return False
    motifs_a, motifs_b = motifs(attr_a.color), motifs(attr_b.color)
    if motifs_a and motifs_b:
        return motifs_compatible(motifs_a, motifs_b)
    family_a, family_b = primary_color(attr_a.color), primary_color(attr_b.color)
    return bool(family_a and family_a == family_b)


def _pick_best_field(members: list[Attributes], field: str) -> tuple[str | None, float]:
    best_value, best_confidence = None, 0.0
    for attr in members:
        value = getattr(attr, field)
        confidence = getattr(attr.confidence, field)
        if value is not None and confidence >= best_confidence:
            best_value, best_confidence = value, confidence
    return best_value, best_confidence


def _vote_category(members: list[Attributes]) -> tuple[str | None, float]:
    """The category most photos agree on (confidence-weighted), so one
    photo's "sweatshirt" doesn't name a pair of trousers seen as trousers in
    three others; the vague "top"/unknown only wins when nothing else was
    read."""
    votes: dict[str, float] = {}
    for attr in members:
        if attr.category and attr.category not in _WILDCARD_CATEGORIES:
            weight = attr.confidence.category * (0.5 if attr.category in _VAGUE_CATEGORIES else 1.0)
            votes[attr.category] = votes.get(attr.category, 0.0) + weight
    if not votes:
        return _pick_best_field(members, "category")
    category = max(votes, key=votes.__getitem__)
    return category, max(a.confidence.category for a in members if a.category == category)


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

    category, category_conf = _vote_category(members)
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
    measured_colors: dict[str, np.ndarray | None] | None = None,
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
    measured_colors = measured_colors or {}
    pair_scores: dict[frozenset[str], float] = {}
    ids_by_photo: dict[str, list[str]] = {}
    for det_id in ids:
        ids_by_photo.setdefault(detections_by_id[det_id].image_id, []).append(det_id)
    reshoots = _reshoot_pairs(ids_by_photo, embeddings)

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
            reshoot=frozenset((detections_by_id[id_a].image_id, detections_by_id[id_b].image_id)) in reshoots,
            color_a=measured_colors.get(id_a),
            color_b=measured_colors.get(id_b),
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
