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

# Two boxes in the same photo overlapping this much are garments lying on
# top of each other; a cutout of the lower one would be missing a chunk, so
# the seller's own photo is the honest thing to show.
_OVERLAP_IOU = 0.35


@dataclass
class _Prepared:
    detection: Detection
    images: DetectionImages
    ocr_texts: list[str]
    embedding: np.ndarray


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)


def _too_small(det: Detection, image: Image.Image) -> bool:
    x1, y1, x2, y2 = det.bbox.as_xyxy()
    width, height = x2 - x1, y2 - y1
    area_fraction = (width * height) / float(image.size[0] * image.size[1])
    return min(width, height) < SETTINGS.min_detection_side_px or area_fraction < SETTINGS.min_detection_area_fraction


def _overlapping_ids(detections: list[Detection]) -> set[str]:
    overlapping: set[str] = set()
    by_image: dict[str, list[Detection]] = {}
    for det in detections:
        by_image.setdefault(det.image_id, []).append(det)
    for group in by_image.values():
        for a, b in combinations(group, 2):
            if _iou(a.bbox.as_xyxy(), b.bbox.as_xyxy()) >= _OVERLAP_IOU:
                overlapping.add(a.id)
                overlapping.add(b.id)
    return overlapping


def _prepare_detection(
    det: Detection,
    image: Image.Image,
    original_rel_path: str,
    output_dir: Path,
    overlapping: bool,
) -> tuple[_Prepared, Image.Image, Image.Image | None]:
    """CPU-side work for one detection: segment, crop, quality-gate the
    cutout, save files, OCR, embed. Returns what the vision step needs too."""
    padded = image_io.pad_bbox(image.size, det.bbox.as_xyxy())
    original_crop = image_io.crop_bbox(image, padded)

    mask, is_fallback = segmentation.segment_garment(image, det.bbox.as_xyxy())
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

    return _Prepared(det, images, texts, embedding), original_crop, cutout


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


def _attach_images(garment: Garment, prepared_by_id: dict[str, _Prepared]) -> Garment:
    variants = [prepared_by_id[det_id].images for det_id in garment.detection_ids if det_id in prepared_by_id]
    # Prefer a clean cutout as the cover image, but only ever one that
    # passed the quality gate; otherwise the seller's own photo crop.
    cover = next((v for v in variants if v.display_kind == "cutout"), variants[0] if variants else None)
    garment.image_variants = variants
    garment.display_image = cover.display if cover else None
    garment.original_image = cover.original if cover else None
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

    overlapping = _overlapping_ids(all_detections)

    # ---- Stage 2: per-detection work, CPU and network overlapped ----
    prepared_by_id: dict[str, _Prepared] = {}
    attributes: dict[str, Attributes] = {}
    state_lock = threading.Lock()
    total = len(all_detections)
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
            current = done_count
        report("segmenting_extracting", current, total)
        emit_partial()

    def cpu_task(det: Detection) -> None:
        image = images_by_id[det.image_id]
        prepared, original_crop, cutout = _prepare_detection(
            det, image, original_rel_by_id[det.image_id], output_dir, det.id in overlapping
        )
        with state_lock:
            prepared_by_id[det.id] = prepared
        future = vision_pool.submit(
            vision_attributes.extract_attributes, original_crop, cutout, prepared.ocr_texts, det.id
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
