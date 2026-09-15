from __future__ import annotations

from itertools import combinations

import numpy as np

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


def _normalize(value: str | None) -> str | None:
    return value.strip().lower() if value else None


def _field_score(a: str | None, b: str | None) -> float:
    """1.0 same, 0.0 different, 0.5 neutral when either side is unknown."""
    norm_a, norm_b = _normalize(a), _normalize(b)
    if norm_a is None or norm_b is None:
        return 0.5
    return 1.0 if norm_a == norm_b else 0.0


def _ocr_score(texts_a: list[str], texts_b: list[str]) -> float:
    set_a = {t.strip().lower() for t in texts_a if t.strip()}
    set_b = {t.strip().lower() for t in texts_b if t.strip()}
    if not set_a or not set_b:
        return 0.5
    union = set_a | set_b
    return len(set_a & set_b) / len(union) if union else 0.5


def is_vetoed(attr_a: Attributes, attr_b: Attributes) -> bool:
    """Two detections can never be the same physical garment if their
    extracted categories confidently disagree (a jacket is never a trouser)."""
    cat_a, cat_b = _normalize(attr_a.category), _normalize(attr_b.category)
    if cat_a in (None, "unknown") or cat_b in (None, "unknown"):
        return False
    return cat_a != cat_b


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
    if is_vetoed(attr_a, attr_b):
        return 0.0

    embedding_sim = cosine_similarity(emb_a, emb_b)
    return (
        WEIGHTS["embedding"] * embedding_sim
        + WEIGHTS["color"] * _field_score(attr_a.color, attr_b.color)
        + WEIGHTS["brand"] * _field_score(attr_a.brand, attr_b.brand)
        + WEIGHTS["size"] * _field_score(attr_a.size, attr_b.size)
        + WEIGHTS["ocr"] * _ocr_score(ocr_a, ocr_b)
    )


class _UnionFind:
    def __init__(self, items: list[str]):
        self.parent = {item: item for item in items}

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        root_a, root_b = self.find(a), self.find(b)
        if root_a != root_b:
            self.parent[root_a] = root_b


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

    A pair of detections is only ever unioned if its score clears the review
    threshold; anything below that stays as two separate garments. Clusters
    that form below the merge threshold, or that look like they might be two
    separate-but-identical items, come out flagged for seller review rather
    than silently merged or silently split (Section 20/50 of the brief).
    """
    detections_by_id = {d.id: d for d in detections}
    ids = [d.id for d in detections]
    union_find = _UnionFind(ids)
    pair_scores: dict[frozenset[str], float] = {}

    for id_a, id_b in combinations(ids, 2):
        # A single photo shows each physical item once. Two detections from
        # the *same* image are two different pieces of clothing laid near
        # each other, never "the same garment seen twice" -- that scenario
        # only exists across different photos. Without this veto, visually
        # similar items (e.g. two long-sleeve bodysuits in different colors)
        # can still score above threshold on embedding similarity alone and
        # get wrongly merged, which is far worse than a same-image false
        # merge ever needs to be.
        if detections_by_id[id_a].image_id == detections_by_id[id_b].image_id:
            pair_scores[frozenset((id_a, id_b))] = 0.0
            continue

        score = pairwise_score(
            attributes[id_a],
            attributes[id_b],
            embeddings[id_a],
            embeddings[id_b],
            ocr_texts.get(id_a, []),
            ocr_texts.get(id_b, []),
        )
        pair_scores[frozenset((id_a, id_b))] = score
        if score >= SETTINGS.match_review_threshold:
            union_find.union(id_a, id_b)

    clusters: dict[str, list[str]] = {}
    for det_id in ids:
        clusters.setdefault(union_find.find(det_id), []).append(det_id)

    return [
        _assemble_garment(index, member_ids, detections_by_id, attributes, embeddings, pair_scores)
        for index, member_ids in enumerate(clusters.values(), start=1)
    ]
