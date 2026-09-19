from __future__ import annotations

import threading
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
# pixels are garments lying on top of / touching each other -- SAM2 tends to
# blend the shared edge into whichever one it was prompted with, so a cutout
# there is missing a chunk, has an invented-looking edge, or bled into the
# neighbour. Comparing the real masks (not just the boxes) catches this even
# when the two garments only touch along one edge and their boxes barely
# overlap, or don't overlap at all while the masks still bleed across the
# gap. This is deliberately sensitive: per the client's own priority, a
# false positive here just costs one more "show the original photo" instead
# of a cutout, while a false negative can ship a distorted or invented-looking
# cutout to a buyer -- the two mistakes are not equally costly.
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


def _too_small(det: Detection, image: Image.Image) -> bool:
    x1, y1, x2, y2 = det.bbox.as_xyxy()
    width, height = x2 - x1, y2 - y1
    area_fraction = (width * height) / float(image.size[0] * image.size[1])
    return min(width, height) < SETTINGS.min_detection_side_px or area_fraction < SETTINGS.min_detection_area_fraction


def _drop_duplicate_detections(
    detections: list[Detection],
    masks_by_id: dict[str, np.ndarray],
    fallback_by_id: dict[str, bool],
) -> tuple[list[Detection], list[str]]:
    """Collapse detections that are really the same physical garment
    detected twice, before any of them can become their own, degraded
    "garment" in the results (each showing the seller's original photo and
    flagged for review, next to its own near-duplicate). Kept separate from
    the overlap check above, which uses a far more sensitive threshold for
    a different question: "is another detection sharing this garment's
    photo enough to distrust a cutout" (true even for a small amount of
    shared pixels) versus this one's "is this actually the same detection
    twice" (true only when one is almost entirely nested in the other)."""
    by_image: dict[str, list[Detection]] = {}
    for det in detections:
        by_image.setdefault(det.image_id, []).append(det)

    dropped: set[str] = set()
    for group in by_image.values():
        for a, b in combinations(group, 2):
            if a.id in dropped or b.id in dropped:
                continue
            if fallback_by_id.get(a.id) or fallback_by_id.get(b.id):
                continue  # no real mask to compare for at least one side
            if _mask_overlap_fraction(masks_by_id[a.id], masks_by_id[b.id]) >= _DUPLICATE_OVERLAP_FRACTION:
                # Keep whichever the detector itself was more confident
                # about; a tie-break on box area favours the more complete
                # view over a tight sub-crop of the same garment.
                def _box_area(det: Detection) -> float:
                    x1, y1, x2, y2 = det.bbox.as_xyxy()
                    return (x2 - x1) * (y2 - y1)

                loser = min((a, b), key=lambda d: (d.detector_confidence, _box_area(d)))
                dropped.add(loser.id)

    if not dropped:
        return detections, []
    kept = [d for d in detections if d.id not in dropped]
    note = f"Slog ihop {len(dropped)} dubblettdetektion(er) av samma plagg i en bild."
    return kept, [note]


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
) -> tuple[_Prepared, Image.Image, Image.Image | None]:
    """CPU-side work for one detection, given its already-computed mask:
    crop, quality-gate the cutout, save files, OCR, embed. Returns what the
    vision step needs too."""
    padded = image_io.pad_bbox(image.size, det.bbox.as_xyxy())
    original_crop = image_io.crop_bbox(image, padded)

    quality = image_io.assess_mask(mask, padded)
    rejected = None
    cutout: Image.Image | None = None
    if is_fallback:
        rejected = "segmentation_failed"
    elif overlapping:
        rejected = "overlaps_other_garment"
    elif not quality.usable:
        rejected = quality.rejected_reason
    else:
        refined = image_io.refine_mask_edges(mask, padded)
        cutout = image_io.apply_mask(image, refined, padded)

    crop_rel = f"crops/{det.id}.jpg"
    image_io.save_image(original_crop, output_dir / crop_rel)
    cutout_rel = None
    if cutout is not None:
        cutout_rel = f"cutouts/{det.id}.png"
        image_io.save_image(cutout, output_dir / cutout_rel)

    images = DetectionImages(
        detection_id=det.id,
        image_id=det.image_id,
        original=original_rel_path,
        crop=crop_rel,
        cutout=cutout_rel,
        display=cutout_rel or crop_rel,
        display_kind="cutout" if cutout_rel else "original",
        cutout_rejected_reason=rejected,
    )

    # OCR reads labels best on the untouched crop (a cutout can whiten out
    # the very tag we want to read when it hangs off the garment edge).
    texts, _confidence = ocr.extract_text_from_image(original_crop)
    # Embeddings are computed on the cutout when we have a clean one (less
    # background noise), otherwise on the crop.
    embedding = embeddings.embed_garment(cutout if cutout is not None else original_crop)

    return _Prepared(det, images, texts, embedding, quality), original_crop, cutout


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
    """Higher means a clearer, more trustworthy photo of the garment. Used
    both to pick which detection's cutout becomes the cover when a garment
    matched across several photos has more than one clean one, and -- when
    *none* of its photos produced a clean cutout -- to pick the original
    crop that shows the garment most fully instead of just the first one
    the seller happened to upload."""
    q = prepared.quality
    not_overlapping = 0.0 if prepared.images.cutout_rejected_reason == "overlaps_other_garment" else 1.0
    extent_score = q.coverage * q.extent_x * q.extent_y
    return (not_overlapping, extent_score, prepared.detection.detector_confidence)


def _attach_images(garment: Garment, prepared_by_id: dict[str, _Prepared]) -> Garment:
    members = [prepared_by_id[det_id] for det_id in garment.detection_ids if det_id in prepared_by_id]
    garment.image_variants = [m.images for m in members]
    if not members:
        return garment

    clean_cutouts = [m for m in members if m.images.display_kind == "cutout"]
    if clean_cutouts:
        # More than one photo of this garment produced a clean cutout --
        # show whichever one most fully captures the garment, not simply
        # whichever detection happened to come first.
        cover = max(clean_cutouts, key=_quality_rank).images
    else:
        # No photo of this garment produced a clean cutout. The seller's
        # own photo is always the honest fallback; when there are several
        # to choose from, prefer the one where the garment is least
        # occluded/cut off rather than defaulting to upload order.
        cover = max(members, key=_quality_rank).images

    garment.display_image = cover.display
    garment.original_image = cover.original

    # No photo of this garment gave us a trustworthy, unoccluded view of it
    # -- the category/attributes were read off a partially hidden item,
    # which is exactly the situation that produces a confidently wrong
    # guess (a bunched sleeve or collar read as a hat). Flag it for the
    # seller to double-check rather than presenting it as settled, even
    # though the *matching* itself may have been perfectly confident.
    if cover.cutout_rejected_reason == "overlaps_other_garment":
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

    # ---- Stage 1: detection (the detector is not thread-safe; sequential) ----
    all_detections: list[Detection] = []
    skipped_tiny = 0
    for i, (image_id, image) in enumerate(images_by_id.items(), start=1):
        for det in detection.detect_garments(image, image_id):
            if _too_small(det, image):
                skipped_tiny += 1
                continue
            all_detections.append(det)
        report("detecting", i, len(images_by_id))

    notes: list[str] = []
    if not all_detections:
        notes.append("Inga plagg hittades i bilderna.")
    if skipped_tiny:
        notes.append(f"Hoppade över {skipped_tiny} mycket små detektioner (lappar/brus).")

    # Fixed for the rest of the "segmenting_extracting" stage's progress
    # reporting, deliberately *before* deduplication below removes any
    # duplicate detections -- the progress denominator must never shrink
    # partway through a stage (it would show the bar jumping backwards).
    # When duplicates exist the bar simply won't quite reach the far end of
    # this stage before "finishing" takes over, which is a far smaller,
    # rarer cosmetic gap than a stall or a jump back.
    raw_total = len(all_detections)

    # ---- Stage 1.5: segmentation for every detection, up front ----
    # SAM2 calls are serialized process-wide already (segmentation.py holds
    # a lock around every call, since the ultralytics model isn't
    # thread-safe), so doing this as its own pass costs no real wall-clock
    # parallelism versus interleaving it with OCR/vision as before -- what
    # it buys is having *every* mask for a photo in hand before deciding
    # which cutouts to trust, which is what makes real overlap detection
    # (comparing masks, not just boxes) possible. Reported as the first half
    # of the "segmenting_extracting" stage so the progress bar keeps moving
    # smoothly straight through into attribute extraction.
    masks_by_id: dict[str, np.ndarray] = {}
    fallback_by_id: dict[str, bool] = {}
    for i, det in enumerate(all_detections, start=1):
        mask, is_fallback = segmentation.segment_garment(images_by_id[det.image_id], det.bbox.as_xyxy())
        masks_by_id[det.id] = mask
        fallback_by_id[det.id] = is_fallback
        report("segmenting_extracting", i, raw_total * 2)

    all_detections, duplicate_notes = _drop_duplicate_detections(all_detections, masks_by_id, fallback_by_id)
    notes.extend(duplicate_notes)
    total = len(all_detections)

    overlapping = _overlapping_ids(all_detections, masks_by_id)

    # ---- Stage 2: per-detection work, CPU and network overlapped ----
    prepared_by_id: dict[str, _Prepared] = {}
    attributes: dict[str, Attributes] = {}
    state_lock = threading.Lock()
    done_count = 0

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
                total_detections=total,
                total_images=len(image_paths),
                notes=list(notes),
                partial=True,
                processed_detections=done_count,
            )
        on_partial(snapshot)

    vision_pool = ThreadPoolExecutor(max_workers=max(1, SETTINGS.vision_concurrency), thread_name_prefix="vision")
    cpu_pool = ThreadPoolExecutor(max_workers=max(1, SETTINGS.cpu_workers), thread_name_prefix="cpu")
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
            current = raw_total + done_count
        report("segmenting_extracting", current, raw_total * 2)
        emit_partial()

    def cpu_task(det: Detection) -> None:
        image = images_by_id[det.image_id]
        is_overlapping = det.id in overlapping
        prepared, original_crop, cutout = _prepare_detection(
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
            cutout,
            prepared.ocr_texts,
            det.id,
            is_overlapping,
        )
        future.add_done_callback(lambda f, det_id=det.id: on_vision_done(det_id, f))
        with vision_lock:
            vision_futures.append(future)

    try:
        cpu_futures = [cpu_pool.submit(cpu_task, det) for det in all_detections]
        for future in cpu_futures:
            future.result()  # surface CPU-side errors (segmentation/IO) loudly
        with vision_lock:
            pending = list(vision_futures)
        for future in pending:
            future.exception()  # wait; failures already handled in the callback
    finally:
        cpu_pool.shutdown(wait=True)
        vision_pool.shutdown(wait=True)

    if attributes and any(a.unavailable for a in attributes.values()):
        notes.append(
            "OPENAI_API_KEY saknas eller ett anrop misslyckades — attribut kunde inte läsas för alla plagg; "
            "matchningen använde bara bild- och textsignaler."
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
    kept = [d for d in all_detections if d.id not in not_garment_ids and d.id in prepared_by_id]

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
    return result


def warm_up() -> None:
    """Load every model once so the first job doesn't pay the cold start."""
    for loader in (detection.get_model, segmentation.warm_up, embeddings.warm_up, ocr.warm_up):
        try:
            loader()
        except Exception as exc:  # noqa: BLE001 -- warm-up is best-effort
            print(f"[pipeline] warm-up failed for {loader.__module__}: {exc}")
