from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator

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


def crop_path_for(path: str | None) -> str | None:
    """The seller's own crop that sits next to a legacy AI cutout
    (`cutouts/<det>.png` -> `crops/<det>.jpg`, always written together)."""
    if not path or "cutouts/" not in path:
        return path
    head, _, name = path.rpartition("cutouts/")
    return f"{head}crops/{name.rsplit('.', 1)[0]}.jpg"


class DetectionImages(BaseModel):
    """Every image we have for one detection, as paths relative to the job's
    file root (served via `/files/{job_id}/...`).

    Product images are always the seller's own photo -- `display` is the
    untouched crop of the original, never an AI-edited cutout (client
    decision 2026-09-25). `occluded` means another garment's mask overlapped
    this one in the photo, so attributes were read off a partly hidden item."""

    detection_id: str
    image_id: str
    original: str
    crop: str
    display: str
    display_kind: str = "original"
    occluded: bool = False

    @model_validator(mode="before")
    @classmethod
    def _originals_only(cls, data):
        # Results stored before 2026-09-25 may point `display` at an AI cutout.
        if isinstance(data, dict):
            data = dict(data)
            if data.get("cutout_rejected_reason") == "overlaps_other_garment":
                data.setdefault("occluded", True)
            data["display"] = data.get("crop") or crop_path_for(data.get("display"))
            data["display_kind"] = "original"
        return data


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

    @model_validator(mode="after")
    def _cover_is_an_original(self):
        self.display_image = crop_path_for(self.display_image)
        return self


class PipelineResult(BaseModel):
    garments: list[Garment]
    total_detections: int
    total_images: int
    notes: list[str] = Field(default_factory=list)
    partial: bool = False
    processed_detections: int = 0
