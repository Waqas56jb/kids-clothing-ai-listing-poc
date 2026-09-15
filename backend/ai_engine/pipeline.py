from __future__ import annotations

from pathlib import Path
from typing import Callable

import numpy as np
from tqdm import tqdm

from ai_engine import detection, embeddings, matching, ocr, segmentation, vision_attributes
from ai_engine.schemas import Attributes, Detection, GarmentCrop, PipelineResult
from ai_engine.utils import image_io

ProgressCallback = Callable[[str, int, int], None]


def run_pipeline(
    input_dir: Path,
    output_dir: Path,
    on_progress: ProgressCallback | None = None,
) -> PipelineResult:
    """Run the full pipeline over every image in `input_dir`.

    `on_progress(stage, current, total)` is called after each unit of work
    within a stage (stage is "detecting" or "segmenting_extracting") so a
    caller -- e.g. a web API polling for a long-running job -- can report
    live progress without this function knowing anything about jobs/HTTP.
    """
    def report(stage: str, current: int, total: int) -> None:
        if on_progress:
            on_progress(stage, current, total)

    output_dir.mkdir(parents=True, exist_ok=True)
    crops_dir = output_dir / "debug" / "crops"
    masks_dir = output_dir / "debug" / "masks"

    image_paths = image_io.list_images(input_dir)
    if not image_paths:
        raise FileNotFoundError(f"No images found in {input_dir}")

    images_by_id = {image_io.image_id_for(p): image_io.load_image(p) for p in image_paths}

    all_detections: list[Detection] = []
    for i, (image_id, image) in enumerate(tqdm(images_by_id.items(), desc="Detecting"), start=1):
        all_detections.extend(detection.detect_garments(image, image_id))
        report("detecting", i, len(images_by_id))

    notes: list[str] = []
    if not all_detections:
        notes.append("No garments detected in any image.")

    attributes: dict[str, Attributes] = {}
    embedding_vectors: dict[str, np.ndarray] = {}
    ocr_texts: dict[str, list[str]] = {}
    crops: dict[str, GarmentCrop] = {}

    for i, det in enumerate(tqdm(all_detections, desc="Segmenting + extracting"), start=1):
        image = images_by_id[det.image_id]
        bbox = det.bbox.as_xyxy()

        mask = segmentation.segment_garment(image, bbox)
        bbox_crop = image_io.crop_bbox(image, bbox)
        masked_crop = image_io.apply_mask(image, mask, bbox)

        bbox_crop_path = image_io.save_image(bbox_crop, crops_dir / f"{det.id}_bbox.png")
        masked_crop_path = image_io.save_image(masked_crop, masks_dir / f"{det.id}_masked.png")
        crops[det.id] = GarmentCrop(
            detection_id=det.id,
            image_id=det.image_id,
            bbox_crop_path=bbox_crop_path,
            masked_crop_path=masked_crop_path,
        )

        texts, _confidence = ocr.extract_text(masked_crop_path)
        ocr_texts[det.id] = texts

        attributes[det.id] = vision_attributes.extract_attributes(
            masked_crop_path, bbox_crop_path, texts, det.id
        )
        embedding_vectors[det.id] = embeddings.embed_garment(masked_crop)
        report("segmenting_extracting", i, len(all_detections))

    if attributes and any(a.unavailable for a in attributes.values()):
        notes.append(
            "OPENAI_API_KEY not set — attribute extraction skipped; "
            "matching fell back to embeddings/OCR signals only."
        )

    # A detector proposal that turns out to be a hang tag, label, or stray
    # background (not a garment at all) should never reach the client as a
    # "garment" -- drop it here rather than let matching try to make sense
    # of it.
    not_garment_ids = {
        det_id for det_id, attr in attributes.items() if attr.category == "not_a_garment"
    }
    if not_garment_ids:
        notes.append(
            f"Discarded {len(not_garment_ids)} detection(s) that turned out not to be "
            "a garment (e.g. a hang tag or label the detector mistook for one)."
        )
        all_detections = [d for d in all_detections if d.id not in not_garment_ids]
        attributes = {k: v for k, v in attributes.items() if k not in not_garment_ids}
        embedding_vectors = {k: v for k, v in embedding_vectors.items() if k not in not_garment_ids}
        ocr_texts = {k: v for k, v in ocr_texts.items() if k not in not_garment_ids}

    garments = matching.build_garments(all_detections, attributes, embedding_vectors, ocr_texts)

    result = PipelineResult(
        garments=garments,
        total_detections=len(all_detections),
        total_images=len(image_paths),
        notes=notes,
    )
    (output_dir / "result.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")
    return result
