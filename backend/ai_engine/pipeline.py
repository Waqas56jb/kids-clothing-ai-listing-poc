from __future__ import annotations

import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

from ai_engine import detection, embeddings, listing_copy, matching, ocr, segmentation, vision_attributes
from ai_engine.config import SETTINGS
from ai_engine.schemas import (
    AttributeConfidence,
    Attributes,
    Detection,
    DetectionImages,
    Garment,
    MatchStatus,
    PipelineResult,
)
from ai_engine.utils import image_io

ProgressCallback = Callable[[str, int, int], None]
PartialCallback = Callable[[PipelineResult], None]

# Two detections in the same photo whose *segmentation masks* actually share
# pixels are garments lying on top of / touching each other, so part of each
# may be hidden. Such a detection is marked `occluded`: the vision model is
# told to be careful with the category (a bunched sleeve peeking out from
# under another garment can look like a hat), a less-occluded photo is
# preferred as the cover, and a garment seen *only* occluded goes to the
# seller for review. Deliberately sensitive -- a false positive costs one
# extra review, a false negative a confidently wrong category.
_MASK_OVERLAP_FRACTION = 0.06

# The detector's multi-phrase prompt sometimes fires more than one box on
# the exact same physical garment (e.g. "baby dress" and "baby shirt" both
# matching one romper's torso), and when one box is a tight sub-region
# nested almost entirely inside the other, standard NMS (which compares
# intersection over *union*) misses it completely -- the union is dominated
# by the bigger box, so the IoU stays low no matter how total the
# containment is. This is measured empirically, not assumed: real test
# photos showed two DINO boxes on one ordinary solo garment photo with 97%+
# of the smaller box's mask contained in the bigger one's, while two boxes
# on two genuinely different, separated garments (whose boxes still
# overlapped by half, as garments piled together often do) shared *zero*
# mask pixels. The gap between those two numbers is large and reliable
# enough to threshold on; a much lower bar was tried first using the
# detections' visual embeddings and rejected -- a shirt crop and an
# unrelated pants crop from the same photo scored a *higher* similarity
# than two crops of the same shirt, so appearance similarity could not be
# trusted to make this call, only the geometry could.
_DUPLICATE_OVERLAP_FRACTION = 0.9

# The mask-to-mask test above only catches a duplicate when the parent's own
# mask actually covers the child. It misses the opposite, equally common
# case: the detector boxes a *limb* of one garment (a sleeve, a trouser leg
# folded away from the body) that SAM2 left out of the parent's mask, so the
# two masks barely touch and the fragment ships as its own listing -- a
# romper's sleeve became a separate "Strumpbyxor" (tights) listing in the
# client's own batch, next to the romper it was cut from. Measured on both
# of that batch's real photos: every genuine duplicate pair had 100% of the
# smaller mask inside the bigger detection's *box*, while the closest pair
# of genuinely different garments reached only 0.44, and the fragment's mask
# was 1.6% of its parent's. The mask-touch floor is what separates "a piece
# of that garment" from "a separate small item that happens to lie inside
# its rectangle" (a sock resting on a spread-out blanket): a real neighbour
# shares no mask pixels at all (0.000-0.005 across both photos), while the
# fragment shared 0.102. All three conditions must hold, because dropping a
# real garment costs the seller an item they could have sold.
_FRAGMENT_INSIDE_BOX_FRACTION = 0.9
_FRAGMENT_MAX_AREA_RATIO = 0.5
_FRAGMENT_MIN_MASK_TOUCH = 0.02

# Geometry alone cannot tell "a part of that garment" from "a separate small
# garment lying against it": when SAM2's mask for a bodysuit bleeds over a
# hat resting on its edge, the hat's mask sits 99.5% inside the bodysuit's,
# exactly like a sleeve's would. Measured on a client pile, the Pooh hat was
# 18% of the giraffe bodysuit's mask area and got dropped as its "duplicate"
# in two of three photos -- which then let the matcher pair the remaining
# hats wrongly. Pieces this small are still tags, feet and slivers of sleeve
# (the round-7 sleeve was 1.6%, tags 3-6%) and are dropped straight away;
# anything bigger is sent through the vision model and decided afterwards
# by what it actually looks like (see _parts_of_bigger_garments).
_SEPARATE_ITEM_MIN_AREA_RATIO = 0.10

# A detector box drawn around two garments at once (measured: one box around
# a bodysuit and the romper lying next to it, each ~50% of its mask) is not
# a garment at all. Its members are big (10-60% of it each) and do not
# overlap each other; a garment with a small item resting on it has just one.
_GROUP_MEMBER_MAX_AREA_RATIO = 0.6


@dataclass
class _Dedup:
    kept: list[Detection]
    dropped: int
    # Ambiguous nested detection -> the bigger one it sits inside; resolved
    # after vision.
    nested_in: dict[str, str]

@dataclass
class _Prepared:
    detection: Detection
    images: DetectionImages
    ocr_texts: list[str]
    embedding: np.ndarray
    quality: image_io.MaskQuality


def _mask_overlap_fraction(mask_a: np.ndarray, mask_b: np.ndarray) -> float:
    """Fraction of the *smaller* mask's own area that sits on top of the
    other mask. Dividing by the smaller area (not IoU's union) is what makes
    this sensitive to a small garment mostly swallowed by a bigger
    neighbour's mask, not just two similarly-sized masks overlapping a lot."""
    area_a, area_b = int(mask_a.sum()), int(mask_b.sum())
    smaller = min(area_a, area_b)
    if smaller == 0:
        return 0.0
    intersection = int(np.logical_and(mask_a, mask_b).sum())
    return intersection / smaller


def _mask_inside_box_fraction(mask: np.ndarray, det: Detection) -> float:
    """Fraction of `mask`'s own pixels that fall inside `det`'s bounding box.

    Deliberately compares against the *box* rather than the other mask: the
    whole point is to catch a garment part that the parent's mask left out."""
    total = int(mask.sum())
    if total == 0:
        return 0.0
    x1, y1, x2, y2 = (int(v) for v in det.bbox.as_xyxy())
    inside = int(mask[max(0, y1):max(0, y2), max(0, x1):max(0, x2)].sum())
    return inside / total


def _too_small(det: Detection, image: Image.Image) -> bool:
    x1, y1, x2, y2 = det.bbox.as_xyxy()
    width, height = x2 - x1, y2 - y1
    area_fraction = (width * height) / float(image.size[0] * image.size[1])
    return min(width, height) < SETTINGS.min_detection_side_px or area_fraction < SETTINGS.min_detection_area_fraction


def _drop_duplicate_detections(
    detections: list[Detection],
    masks_by_id: dict[str, np.ndarray],
    fallback_by_id: dict[str, bool],
) -> _Dedup:
    """Collapse detections that are really the same physical garment
    detected twice, and drop boxes drawn around several garments at once,
    before either becomes its own "garment" in the results. Only compares
    detections within one photo, and never a rectangular fallback mask."""
    by_image: dict[str, list[Detection]] = {}
    for det in detections:
        by_image.setdefault(det.image_id, []).append(det)

    dropped: set[str] = set()
    nested_in: dict[str, str] = {}
    for group in by_image.values():
        real = [d for d in group if not fallback_by_id.get(d.id)]
        area = {d.id: int(masks_by_id[d.id].sum()) for d in real}

        def inside(child: Detection, parent: Detection) -> bool:
            return (
                area[child.id] > 0
                and area[parent.id] >= area[child.id]
                and _mask_overlap_fraction(masks_by_id[child.id], masks_by_id[parent.id]) >= _DUPLICATE_OVERLAP_FRACTION
            )

        for parent in real:
            members = [
                c for c in real
                if c.id != parent.id
                and inside(c, parent)
                and _SEPARATE_ITEM_MIN_AREA_RATIO <= area[c.id] / area[parent.id] <= _GROUP_MEMBER_MAX_AREA_RATIO
            ]
            distinct = [
                (x, y) for x, y in combinations(members, 2)
                if _mask_overlap_fraction(masks_by_id[x.id], masks_by_id[y.id]) < 0.5
            ]
            if distinct:
                dropped.add(parent.id)

        for a, b in combinations(real, 2):
            if a.id in dropped or b.id in dropped:
                continue
            small, big = sorted((a, b), key=lambda d: area[d.id])
            if not area[big.id]:
                continue
            ratio = area[small.id] / area[big.id]
            touch = _mask_overlap_fraction(masks_by_id[a.id], masks_by_id[b.id])

            if ratio > _FRAGMENT_MAX_AREA_RATIO:
                if touch >= _DUPLICATE_OVERLAP_FRACTION:
                    # The same garment boxed twice by different prompt
                    # phrases. Keep whichever the detector was more sure
                    # of; a tie goes to the more complete (bigger) box.
                    def _box_area(det: Detection) -> float:
                        x1, y1, x2, y2 = det.bbox.as_xyxy()
                        return (x2 - x1) * (y2 - y1)

                    dropped.add(min((a, b), key=lambda d: (d.detector_confidence, _box_area(d))).id)
                continue

            nested = touch >= _DUPLICATE_OVERLAP_FRACTION or (
                touch >= _FRAGMENT_MIN_MASK_TOUCH
                and _mask_inside_box_fraction(masks_by_id[small.id], big) >= _FRAGMENT_INSIDE_BOX_FRACTION
            )
            if not nested:
                continue
            if ratio < _SEPARATE_ITEM_MIN_AREA_RATIO:
                # Always the small piece, never the garment around it: the
                # detector was more confident about a clean sleeve than the
                # rumpled romper it belonged to.
                dropped.add(small.id)
            else:
                nested_in.setdefault(small.id, big.id)

    kept = [d for d in detections if d.id not in dropped]
    return _Dedup(kept=kept, dropped=len(dropped), nested_in={c: p for c, p in nested_in.items() if c not in dropped})


# Kinds of item that are never a piece of a bigger garment -- a hat can rest
# on a bodysuit, but it is never its sleeve.
_STANDALONE_CATEGORIES = frozenset({"hat", "beanie", "socks", "shoes", "mittens", "scarf", "accessory"})


def _parts_of_bigger_garments(nested_in: dict[str, str], attributes: dict[str, Attributes], alive: set[str]) -> set[str]:
    """Settle the nested detections the geometry could not, from what the
    vision model saw: a piece is dropped as part of the garment around it
    unless it is a standalone kind of item, or confidently a different
    fabric (colour or print). Anything unreadable is kept -- losing a real
    garment the seller could have sold is the worse mistake."""
    parts: set[str] = set()
    for child_id, parent_id in nested_in.items():
        if child_id not in alive or parent_id not in alive:
            continue
        child, parent = attributes.get(child_id), attributes.get(parent_id)
        if child is None or parent is None or child.unavailable or parent.unavailable:
            continue
        if child.category in _STANDALONE_CATEGORIES and not matching.categories_compatible(child.category, parent.category):
            continue
        if matching.appearance_differs(child, parent):
            continue
        parts.add(child_id)
    return parts


def _overlapping_ids(detections: list[Detection], masks_by_id: dict[str, np.ndarray]) -> set[str]:
    """Detection ids whose segmentation mask meaningfully shares pixels with
    another detection's mask in the *same photo*. A rectangular fallback
    mask (segmentation failed) is just its own box, so this naturally covers
    plain box-overlap too without a separate check."""
    overlapping: set[str] = set()
    by_image: dict[str, list[Detection]] = {}
    for det in detections:
        by_image.setdefault(det.image_id, []).append(det)
    for group in by_image.values():
        for a, b in combinations(group, 2):
            if _mask_overlap_fraction(masks_by_id[a.id], masks_by_id[b.id]) >= _MASK_OVERLAP_FRACTION:
                overlapping.add(a.id)
                overlapping.add(b.id)
    return overlapping


def _prepare_detection(
    det: Detection,
    image: Image.Image,
    original_rel_path: str,
    output_dir: Path,
    mask: np.ndarray,
    is_fallback: bool,
    overlapping: bool,
) -> tuple[_Prepared, Image.Image]:
    """CPU-side work for one detection, given its already-computed mask:
    crop the seller's photo, OCR, embed. Returns what the vision step needs."""
    padded = image_io.pad_bbox(image.size, det.bbox.as_xyxy())
    original_crop = image_io.crop_bbox(image, padded)
    quality = image_io.assess_mask(mask, padded)

    crop_rel = f"crops/{det.id}.jpg"
    image_io.save_image(original_crop, output_dir / crop_rel)
    images = DetectionImages(
        detection_id=det.id,
        image_id=det.image_id,
        original=original_rel_path,
        crop=crop_rel,
        display=crop_rel,
        occluded=overlapping,
    )

    texts, _confidence = ocr.extract_text_from_image(original_crop)
    # Matching was calibrated on embeddings of the garment with its
    # background masked out, so that is still what it compares. This masked
    # image exists only in memory for the embedding: it is never saved and
    # never shown -- product images are always the seller's own photo.
    if is_fallback or overlapping or not quality.usable:
        embed_source = original_crop
    else:
        embed_source = image_io.apply_mask(image, image_io.refine_mask_edges(mask, padded), padded)
    embedding = embeddings.embed_garment(embed_source)

    return _Prepared(det, images, texts, embedding, quality), original_crop


def _single_detection_garment(index: int, prepared: _Prepared, attrs: Attributes) -> Garment:
    return Garment(
        id=f"garment_{index:03d}",
        category=attrs.category or "unknown",
        brand=attrs.brand,
        size=attrs.size,
        color=attrs.color,
        condition=attrs.condition,
        gender=attrs.gender,
        defects=attrs.defects,
        confidence=attrs.confidence or AttributeConfidence(),
        images=[prepared.detection.image_id],
        detection_ids=[prepared.detection.id],
        match_confidence=1.0,
        match_status=MatchStatus.HIGH_CONFIDENCE,
        image_variants=[prepared.images],
        display_image=prepared.images.display,
        original_image=prepared.images.original,
    )


def _quality_rank(prepared: _Prepared) -> tuple[float, float, float]:
    """Higher means a clearer, fuller view of the garment: picks which of a
    matched garment's photos becomes the cover instead of upload order."""
    q = prepared.quality
    unoccluded = 0.0 if prepared.images.occluded else 1.0
    extent_score = q.coverage * q.extent_x * q.extent_y
    return (unoccluded, extent_score, prepared.detection.detector_confidence)


def _attach_images(garment: Garment, prepared_by_id: dict[str, _Prepared]) -> Garment:
    members = [prepared_by_id[det_id] for det_id in garment.detection_ids if det_id in prepared_by_id]
    garment.image_variants = [m.images for m in members]
    if not members:
        return garment

    cover = max(members, key=_quality_rank).images
    garment.display_image = cover.display
    garment.original_image = cover.original

    # Every photo of this garment shows it partly hidden under another one,
    # so its category/attributes were read off an incomplete view -- the
    # situation that produces a confidently wrong guess. The seller decides.
    if cover.occluded:
        garment.match_status = MatchStatus.NEEDS_REVIEW

    return garment


def run_pipeline(
    input_dir: Path,
    output_dir: Path,
    on_progress: ProgressCallback | None = None,
    on_partial: PartialCallback | None = None,
) -> PipelineResult:
    """Run the full pipeline over every image in `input_dir`.

    `on_progress(stage, current, total)` fires after each unit of work so a
    caller (the job runner) can report live progress; `on_partial(result)`
    fires with a provisional, per-detection result every time a garment's
    attributes land, so the UI can show items as they finish instead of
    waiting for the whole batch.
    """
    def report(stage: str, current: int, total: int) -> None:
        if on_progress:
            on_progress(stage, current, total)

    output_dir.mkdir(parents=True, exist_ok=True)

    image_paths = image_io.list_images(input_dir)
    if not image_paths:
        raise FileNotFoundError(f"No images found in {input_dir}")

    images_by_id: dict[str, Image.Image] = {}
    original_rel_by_id: dict[str, str] = {}
    for path in image_paths:
        image_id = image_io.image_id_for(path)
        images_by_id[image_id] = image_io.load_image(path)
        original_rel_by_id[image_id] = f"originals/{path.name}"

    # ---- Stages 1-2, streamed photo by photo ----
    # Each photo is detected, segmented (one SAM2 call for all its boxes),
    # de-duplicated and handed to OCR/embedding/vision before the next photo
    # is even looked at. Duplicates and overlaps only ever concern boxes in
    # the same photo, so nothing is lost by not waiting for the others --
    # and the vision calls, which are paced by the OpenAI rate limit, run
    # while the CPU is still busy with the next photo instead of after it.
    started = time.perf_counter()
    notes: list[str] = []
    skipped_tiny = 0
    duplicates_dropped = 0
    detections: list[Detection] = []
    masks_by_id: dict[str, np.ndarray] = {}
    fallback_by_id: dict[str, bool] = {}
    nested_in: dict[str, str] = {}
    prepared_by_id: dict[str, _Prepared] = {}
    attributes: dict[str, Attributes] = {}
    state_lock = threading.Lock()
    done_count = 0
    analysing = True

    def emit_partial() -> None:
        if not on_partial:
            return
        with state_lock:
            finished = [
                det_id for det_id in prepared_by_id
                if det_id in attributes and attributes[det_id].category != "not_a_garment"
            ]
            garments = [
                _single_detection_garment(index, prepared_by_id[det_id], attributes[det_id])
                for index, det_id in enumerate(finished, start=1)
            ]
            snapshot = PipelineResult(
                garments=garments,
                total_detections=len(detections),
                total_images=len(image_paths),
                notes=list(notes),
                partial=True,
                processed_detections=done_count,
            )
        on_partial(snapshot)

    vision_pool = ThreadPoolExecutor(max_workers=max(1, SETTINGS.vision_concurrency), thread_name_prefix="vision")
    cpu_pool = ThreadPoolExecutor(max_workers=max(1, SETTINGS.cpu_workers), thread_name_prefix="cpu")
    cpu_futures: list[Future] = []
    vision_futures: list[Future] = []
    vision_lock = threading.Lock()

    def on_vision_done(det_id: str, future: Future) -> None:
        nonlocal done_count
        try:
            attrs = future.result()
        except Exception as exc:  # noqa: BLE001 -- one bad call must not sink the batch
            print(f"[pipeline] vision failed for {det_id}: {exc}")
            attrs = Attributes(detection_id=det_id, category="unknown", unavailable=True)
        with state_lock:
            attributes[det_id] = attrs
            done_count += 1
            current, total, still_analysing = done_count, len(detections), analysing
        # While photos are still being analysed the bar tracks photos; the
        # count of garments to read is only final once they all are.
        if not still_analysing:
            report("segmenting_extracting", current, total)
        emit_partial()

    def cpu_task(det: Detection, image: Image.Image, is_overlapping: bool) -> None:
        prepared, original_crop = _prepare_detection(
            det,
            image,
            original_rel_by_id[det.image_id],
            output_dir,
            masks_by_id[det.id],
            fallback_by_id[det.id],
            is_overlapping,
        )
        with state_lock:
            prepared_by_id[det.id] = prepared
        future = vision_pool.submit(
            vision_attributes.extract_attributes,
            original_crop,
            prepared.ocr_texts,
            det.id,
            is_overlapping,
        )
        future.add_done_callback(lambda f, det_id=det.id: on_vision_done(det_id, f))
        with vision_lock:
            vision_futures.append(future)

    try:
        for i, (image_id, image) in enumerate(images_by_id.items(), start=1):
            # The detector is not thread-safe; photos go through it in turn.
            photo_detections = []
            for det in detection.detect_garments(image, image_id):
                if _too_small(det, image):
                    skipped_tiny += 1
                else:
                    photo_detections.append(det)
            segments = segmentation.segment_garments(image, [d.bbox.as_xyxy() for d in photo_detections])
            for det, (mask, is_fallback) in zip(photo_detections, segments):
                masks_by_id[det.id] = mask
                fallback_by_id[det.id] = is_fallback

            dedup = _drop_duplicate_detections(photo_detections, masks_by_id, fallback_by_id)
            duplicates_dropped += dedup.dropped
            nested_in.update(dedup.nested_in)
            overlapping = _overlapping_ids(dedup.kept, masks_by_id)
            with state_lock:
                detections.extend(dedup.kept)
            for det in dedup.kept:
                cpu_futures.append(cpu_pool.submit(cpu_task, det, image, det.id in overlapping))
            report("detecting", i, len(images_by_id))
        analysed_at = time.perf_counter()

        with state_lock:
            analysing = False
            current, total = done_count, len(detections)
        report("segmenting_extracting", current, total)

        for future in cpu_futures:
            future.result()  # surface CPU-side errors (segmentation/IO) loudly
        with vision_lock:
            pending = list(vision_futures)
        for future in pending:
            future.exception()  # wait; failures already handled in the callback
    finally:
        cpu_pool.shutdown(wait=True)
        vision_pool.shutdown(wait=True)
    read_at = time.perf_counter()

    if not detections:
        notes.append("Inga plagg hittades i bilderna.")
    if skipped_tiny:
        notes.append(f"Hoppade över {skipped_tiny} mycket små detektioner (lappar/brus).")

    unavailable_count = sum(1 for a in attributes.values() if a.unavailable)
    if unavailable_count:
        notes.append(
            f"AI-tjänsten kunde inte läsa av {unavailable_count} plagg (tillfälligt fel). De visas som egna plagg "
            "markerade för granskning i stället för att matchas mot andra bilder."
        )

    # A detector proposal that turns out to be a hang tag, label, or stray
    # background (not a garment at all) should never reach the client as a
    # "garment" -- drop it here rather than let matching try to make sense
    # of it.
    not_garment_ids = {det_id for det_id, attr in attributes.items() if attr.category == "not_a_garment"}
    if not_garment_ids:
        notes.append(
            f"Tog bort {len(not_garment_ids)} detektion(er) som inte var plagg (t.ex. en prislapp eller etikett)."
        )
    alive = {d.id for d in detections if d.id not in not_garment_ids and d.id in prepared_by_id}
    parts = _parts_of_bigger_garments(nested_in, attributes, alive)
    duplicates_dropped += len(parts)
    if duplicates_dropped:
        notes.append(f"Slog ihop {duplicates_dropped} dubblettdetektion(er) av samma plagg i en bild.")
    kept = [d for d in detections if d.id in alive and d.id not in parts]

    # Occlusion is re-judged on the final set: a garment is not "partly
    # hidden" by its own sleeve or by a price tag that turned out to be one.
    final_overlap = _overlapping_ids(kept, masks_by_id)
    for det in kept:
        prepared_by_id[det.id].images.occluded = det.id in final_overlap

    # ---- Stage 3: matching + Swedish listing copy ----
    report("finishing", 0, 2)
    garments = matching.build_garments(
        kept,
        {d.id: attributes[d.id] for d in kept},
        {d.id: prepared_by_id[d.id].embedding for d in kept},
        {d.id: prepared_by_id[d.id].ocr_texts for d in kept},
    )
    garments = [_attach_images(g, prepared_by_id) for g in garments]
    report("finishing", 1, 2)

    copy = listing_copy.generate_listing_copy([g.model_dump() for g in garments])
    for garment in garments:
        text = copy.get(garment.id) or {}
        garment.listing_title = text.get("title")
        garment.listing_description = text.get("description")
    report("finishing", 2, 2)

    result = PipelineResult(
        garments=garments,
        total_detections=len(kept),
        total_images=len(image_paths),
        notes=notes,
        partial=False,
        processed_detections=len(kept),
    )
    (output_dir / "result.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")
    finished_at = time.perf_counter()
    print(
        f"[pipeline] {len(image_paths)} photo(s), {len(detections)} detection(s), {len(garments)} garment(s): "
        f"analyse {analysed_at - started:.0f}s, read {read_at - analysed_at:.0f}s, "
        f"match+copy {finished_at - read_at:.0f}s, total {finished_at - started:.0f}s"
    )
    return result


def warm_up() -> None:
    """Load every model once so the first job doesn't pay the cold start."""
    for loader in (detection.get_model, segmentation.warm_up, embeddings.warm_up, ocr.warm_up):
        try:
            loader()
        except Exception as exc:  # noqa: BLE001 -- warm-up is best-effort
            print(f"[pipeline] warm-up failed for {loader.__module__}: {exc}")
