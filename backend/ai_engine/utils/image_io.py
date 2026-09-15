from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


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


def crop_bbox(image: Image.Image, bbox: tuple[float, float, float, float]) -> Image.Image:
    x1, y1, x2, y2 = bbox
    width, height = image.size
    x1 = max(0, min(int(x1), width - 1))
    y1 = max(0, min(int(y1), height - 1))
    x2 = max(x1 + 1, min(int(x2), width))
    y2 = max(y1 + 1, min(int(y2), height))
    return image.crop((x1, y1, x2, y2))


def apply_mask(image: Image.Image, mask: np.ndarray, bbox: tuple[float, float, float, float]) -> Image.Image:
    """Return a bbox crop with the background outside the mask painted white.

    `mask` is a full-image-sized boolean/0-1 array. Falls back to a plain
    bbox crop if the mask doesn't cover the box (e.g. segmentation failed).
    """
    x1, y1, x2, y2 = bbox
    width, height = image.size
    x1 = max(0, min(int(x1), width - 1))
    y1 = max(0, min(int(y1), height - 1))
    x2 = max(x1 + 1, min(int(x2), width))
    y2 = max(y1 + 1, min(int(y2), height))

    image_arr = np.array(image)
    mask_bool = mask.astype(bool)
    white_bg = np.full_like(image_arr, 255)
    composited = np.where(mask_bool[..., None], image_arr, white_bg)
    return Image.fromarray(composited[y1:y2, x1:x2])


def save_image(image: Image.Image, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    return str(path)
