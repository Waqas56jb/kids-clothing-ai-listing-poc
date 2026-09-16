from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    openai_api_key: str | None
    openai_vision_model: str
    openai_text_model: str

    match_merge_threshold: float
    match_review_threshold: float
    gender_confidence_threshold: float
    condition_confidence_threshold: float

    # Performance knobs. Vision calls are network-bound, so several can be in
    # flight while the CPU works through segmentation/OCR/embeddings.
    vision_concurrency: int
    vision_image_max_px: int
    cpu_workers: int
    # Detector boxes smaller than this are tags, socks-in-the-distance, or
    # noise -- never a sellable, readable garment -- and skipping them saves
    # a SAM2 + OCR + vision round-trip each.
    min_detection_side_px: int
    min_detection_area_fraction: float

    models_cache_dir: Path
    detector_model_id: str
    sam_checkpoint: str
    clip_model_name: str
    clip_pretrained: str


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value else default


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


def load_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY") or None,
        openai_vision_model=os.getenv("OPENAI_VISION_MODEL", "gpt-4o"),
        openai_text_model=os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini"),
        match_merge_threshold=_float_env("MATCH_MERGE_THRESHOLD", 0.85),
        match_review_threshold=_float_env("MATCH_REVIEW_THRESHOLD", 0.65),
        gender_confidence_threshold=_float_env("GENDER_CONFIDENCE_THRESHOLD", 0.75),
        condition_confidence_threshold=_float_env("CONDITION_CONFIDENCE_THRESHOLD", 0.92),
        vision_concurrency=_int_env("VISION_CONCURRENCY", 6),
        vision_image_max_px=_int_env("VISION_IMAGE_MAX_PX", 1024),
        cpu_workers=_int_env("PIPELINE_CPU_WORKERS", 2),
        min_detection_side_px=_int_env("MIN_DETECTION_SIDE_PX", 40),
        min_detection_area_fraction=_float_env("MIN_DETECTION_AREA_FRACTION", 0.004),
        models_cache_dir=Path(os.getenv("MODELS_CACHE_DIR", "models_cache")),
        detector_model_id=os.getenv("DETECTOR_MODEL_ID", "IDEA-Research/grounding-dino-tiny"),
        sam_checkpoint=os.getenv("SAM_CHECKPOINT", "sam2_t.pt"),
        clip_model_name=os.getenv("CLIP_MODEL_NAME", "ViT-B-32-quickgelu"),
        clip_pretrained=os.getenv("CLIP_PRETRAINED", "openai"),
    )


SETTINGS = load_settings()
