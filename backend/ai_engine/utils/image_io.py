from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Extra room around a detector box before cropping. Boxes are frequently a
# few percent tight on sleeves, hems, and collars; a small margin keeps every
# visible part of the garment inside the crop instead of slicing it off.
BBOX_PAD_FRACTION = 0.05
BBOX_PAD_MIN_PX = 10


def list_images(input_dir: Path) -> list[Path]:
    return sorted(
        p for p in input_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def image_id_for(path: Path) -> str:
    return path.stem


def load_image(path: Path, max_dimension: int = 1600) -> Image.Image:
    """Load an image, corrected for EXIF orientation and capped in size.

    Phone photos routinely carry an EXIF rotation flag (portrait shots
    stored as landscape pixel data, rotate-on-display) -- `PIL.Image.open`
    ignores it, so every downstream box/mask would silently be computed
    against a sideways image otherwise. Real camera photos also arrive at
    10-12MP, far more than detection/segmentation need; capping the longest
    side keeps SAM2 (the slow step, CPU-only) from taking many minutes per
    photo, with no meaningful loss of accuracy at this scale.
    """
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    width, height = image.size
    scale = max_dimension / max(width, height)
    if scale < 1:
        image = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    return image


def clamp_bbox(image_size: tuple[int, int], bbox: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    width, height = image_size
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(int(round(x1)), width - 1))
    y1 = max(0, min(int(round(y1)), height - 1))
    x2 = max(x1 + 1, min(int(round(x2)), width))
    y2 = max(y1 + 1, min(int(round(y2)), height))
    return x1, y1, x2, y2


def pad_bbox(
    image_size: tuple[int, int],
    bbox: tuple[float, float, float, float],
    fraction: float = BBOX_PAD_FRACTION,
    min_px: int = BBOX_PAD_MIN_PX,
) -> tuple[int, int, int, int]:
    """Grow a box by a small margin on every side, clamped to the image."""
    x1, y1, x2, y2 = bbox
    pad_x = max(min_px, (x2 - x1) * fraction)
    pad_y = max(min_px, (y2 - y1) * fraction)
    return clamp_bbox(image_size, (x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y))


def crop_bbox(image: Image.Image, bbox: tuple[float, float, float, float]) -> Image.Image:
    """Crop exactly the box (already padded/clamped by the caller if desired).

    The crop is never resampled non-uniformly, so the garment's proportions
    are always exactly those of the seller's photo."""
    return image.crop(clamp_bbox(image.size, bbox))


@dataclass(frozen=True)
class MaskQuality:
    coverage: float        # mask pixels / box pixels
    hole_fraction: float   # filled-mask pixels not in mask / mask pixels
    extent_x: float        # mask bbox width / box width
    extent_y: float        # mask bbox height / box height
    rejected_reason: str | None

    @property
    def usable(self) -> bool:
        return self.rejected_reason is None


def assess_mask(mask: np.ndarray, bbox: tuple[int, int, int, int]) -> MaskQuality:
    """Decide whether a segmentation mask is good enough to show as a cutout.

    A bad cutout (garment chopped in half, a big black-looking hole, or a
    mask that grabbed almost nothing / the whole rectangle) is worse for the
    seller than simply showing their own photo, so anything that fails these
    checks is reported with a reason and the caller falls back to the
    original crop.
    """
    x1, y1, x2, y2 = bbox
    box = mask[y1:y2, x1:x2].astype(np.uint8)
    box_area = float(box.size) or 1.0
    mask_area = float(box.sum())
    coverage = mask_area / box_area

    if mask_area == 0:
        return MaskQuality(0.0, 0.0, 0.0, 0.0, "empty_mask")

    ys, xs = np.nonzero(box)
    extent_x = float(xs.max() - xs.min() + 1) / float(x2 - x1)
    extent_y = float(ys.max() - ys.min() + 1) / float(y2 - y1)

    # Fill enclosed holes and measure how much of the silhouette was missing.
    contours, _ = cv2.findContours(box, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(box)
    cv2.drawContours(filled, contours, -1, 1, thickness=cv2.FILLED)
    filled_area = float(filled.sum()) or mask_area
    hole_fraction = max(0.0, (filled_area - mask_area) / filled_area)

    reason: str | None = None
    if coverage < 0.18:
        reason = "mask_too_small"
    elif coverage > 0.985:
        reason = "mask_is_whole_box"
    elif hole_fraction > 0.12:
        reason = "mask_has_holes"
    elif extent_x < 0.55 or extent_y < 0.55:
        reason = "mask_cut_off_garment"
    return MaskQuality(coverage, hole_fraction, extent_x, extent_y, reason)


def refine_mask_edges(mask: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    """Slightly grow the mask so cutout edges never eat into the fabric.

    SAM2 boundaries tend to sit a pixel or two *inside* the true edge, which
    reads as a thin shaved-off outline on light garments. A dilation scaled
    to the garment size restores that edge without pulling in background."""
    x1, y1, x2, y2 = bbox
    diagonal = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    kernel_size = max(3, int(diagonal * 0.006)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    return cv2.dilate(mask.astype(np.uint8), kernel).astype(bool)


def apply_mask(image: Image.Image, mask: np.ndarray, bbox: tuple[float, float, float, float]) -> Image.Image:
    """Return a bbox crop with the background outside the mask painted white,
    with a soft (feathered) edge so the cutout does not look jagged.

    `mask` is a full-image-sized boolean/0-1 array. Falls back to a plain
    bbox crop if the mask doesn't cover the box (e.g. segmentation failed).
    """
    x1, y1, x2, y2 = clamp_bbox(image.size, bbox)
    image_arr = np.array(image).astype(np.float32)
    alpha = mask.astype(np.float32)
    # Feather ~1px so edges blend instead of stair-stepping.
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=1.0)[..., None]
    white = np.full_like(image_arr, 255.0)
    composited = image_arr * alpha + white * (1.0 - alpha)
    return Image.fromarray(np.clip(composited[y1:y2, x1:x2], 0, 255).astype(np.uint8))


def save_image(image: Image.Image, path: Path, quality: int = 92) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        image.convert("RGB").save(path, format="JPEG", quality=quality, optimize=True)
    else:
        image.save(path)
    return str(path)


def downscaled_copy(image: Image.Image, max_dimension: int) -> Image.Image:
    width, height = image.size
    scale = max_dimension / max(width, height)
    if scale >= 1:
        return image
    return image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
