from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

# Canonical category keys the vision model must choose from. Keeping these as
# stable English keys (not free text) is what lets pricing rules, grouping,
# matching vetoes, and the Swedish UI labels all agree on one vocabulary.
CATEGORY_KEYS = [
    "bodysuit",
    "onesie",
    "romper",
    "sleeper",
    "pajamas",
    "dress",
    "skirt",
    "t-shirt",
    "top",
    "shirt",
    "blouse",
    "sweater",
    "hoodie",
    "sweatshirt",
    "cardigan",
    "jacket",
    "coat",
    "vest",
    "trousers",
    "jeans",
    "leggings",
    "shorts",
    "overalls",
    "socks",
    "tights",
    "hat",
    "beanie",
    "mittens",
    "scarf",
    "shoes",
    "swimwear",
    "accessory",
    "other",
    "not_a_garment",
]

CONDITION_KEYS = ["new", "like new", "good", "fair", "worn", "damaged"]


class BBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

    def as_xyxy(self) -> tuple[float, float, float, float]:
        return (self.x1, self.y1, self.x2, self.y2)


class Detection(BaseModel):
    id: str
    image_id: str
    bbox: BBox
    detector_confidence: float


class GarmentCrop(BaseModel):
    detection_id: str
    image_id: str
    bbox_crop_path: str
    masked_crop_path: str


class OcrResult(BaseModel):
    detection_id: str
    texts: list[str] = Field(default_factory=list)
    raw_confidence: float = 0.0


class AttributeConfidence(BaseModel):
    category: float = 0.0
    brand: float = 0.0
    size: float = 0.0
    color: float = 0.0
    condition: float = 0.0
    gender: float = 0.0


class Attributes(BaseModel):
    detection_id: str
    category: str = "unknown"
    brand: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    condition: Optional[str] = None
    gender: Optional[str] = None
    defects: Optional[str] = None
    confidence: AttributeConfidence = Field(default_factory=AttributeConfidence)
    unavailable: bool = False


class MatchStatus(str, Enum):
    HIGH_CONFIDENCE = "high_confidence"
    MEDIUM_CONFIDENCE = "medium_confidence"
    NEEDS_REVIEW = "needs_review"


class DetectionImages(BaseModel):
    """Every image variant we have for one detection, as paths relative to
    the job's file root (served via `/files/{job_id}/...`).

    `display` is the one the UI should show by default: the clean cutout
    when the mask passed quality checks, otherwise the untouched crop from
    the seller's own photo -- the AI is never allowed to make the seller's
    photo look worse."""

    detection_id: str
    image_id: str
    original: str
    crop: str
    cutout: Optional[str] = None
    display: str
    display_kind: str = "original"  # "cutout" | "original"
    cutout_rejected_reason: Optional[str] = None


class Garment(BaseModel):
    id: str
    category: str
    brand: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    condition: Optional[str] = None
    gender: Optional[str] = None
    defects: Optional[str] = None
    confidence: AttributeConfidence
    images: list[str]
    detection_ids: list[str]
    match_confidence: float
    match_status: MatchStatus
    image_variants: list[DetectionImages] = Field(default_factory=list)
    display_image: Optional[str] = None
    original_image: Optional[str] = None
    listing_title: Optional[str] = None
    listing_description: Optional[str] = None


class PipelineResult(BaseModel):
    garments: list[Garment]
    total_detections: int
    total_images: int
    notes: list[str] = Field(default_factory=list)
    partial: bool = False
    processed_detections: int = 0
