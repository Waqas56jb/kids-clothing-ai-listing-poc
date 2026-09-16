from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from ai_engine.config import SETTINGS

_model = None
_lock = threading.Lock()


def _checkpoint_path() -> Path:
    # Passing a full path (rather than just the checkpoint name) keeps the
    # auto-downloaded weights inside our own cache dir instead of wherever
    # the process happens to be run from.
    path = SETTINGS.models_cache_dir / "sam" / SETTINGS.sam_checkpoint
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from ultralytics import SAM

                _model = SAM(str(_checkpoint_path()))
    return _model


def warm_up() -> None:
    get_model()


def _rectangular_fallback_mask(image_size: tuple[int, int], bbox: tuple[float, float, float, float]) -> np.ndarray:
    width, height = image_size
    mask = np.zeros((height, width), dtype=bool)
    x1, y1, x2, y2 = [int(v) for v in bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(width, x2), min(height, y2)
    mask[y1:y2, x1:x2] = True
    return mask


def _largest_connected_component(mask: np.ndarray) -> np.ndarray:
    """Keep only the largest connected blob in the mask.

    A box prompt sometimes pulls in a foreign object that happens to sit
    inside the same bounding box as the garment -- a hanger, a security tag,
    a wall reflection -- as a second, disconnected blob in the mask. That
    blob then gets composited into the "clean" crop right alongside the
    garment. The garment itself is always one connected piece (a tear just
    puts a hole in it, it doesn't split it in two), so dropping every blob
    but the largest removes exactly this class of artifact without touching
    real damage.
    """
    mask_uint8 = mask.astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    if num_labels <= 2:  # background + at most one foreground blob already
        return mask
    largest_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == largest_label


def _close_small_boundary_gaps(mask: np.ndarray, bbox: tuple[float, float, float, float]) -> np.ndarray:
    """Fill small bite-shaped notches along the mask boundary.

    Near a hem/fold/clipped tag, low contrast between garment and background
    can make SAM2 cut a small, clean, background-colored notch out of the
    silhouette -- it looks exactly like a tear in the whited-out crop, but
    it's a masking error, not real fabric damage. A real tear/hole in the
    underlying photo still shows up fine once these pixels are restored,
    since it's a genuine color/texture difference, not just a mask-shaped
    gap; a morphological close (scaled to the garment's own size, not a
    fixed pixel count) only fills gaps small relative to the garment.
    """
    x1, y1, x2, y2 = bbox
    diagonal = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    kernel_size = max(3, int(diagonal * 0.02)) | 1  # odd, >=3
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    return closed.astype(bool)


def segment_garment(image: Image.Image, bbox: tuple[float, float, float, float]) -> tuple[np.ndarray, bool]:
    """Return (mask, is_fallback) -- a boolean mask, same (H, W) as `image`,
    for the garment inside `bbox`. `is_fallback` is True when SAM2 produced
    nothing usable and the mask is just the rectangle (callers must then
    show the original crop instead of a "cutout")."""
    model = get_model()
    # ultralytics models are not safe to call from several threads at once.
    with _lock:
        results = model(image, bboxes=[list(bbox)], verbose=False)

    if not results or results[0].masks is None or len(results[0].masks.data) == 0:
        return _rectangular_fallback_mask(image.size, bbox), True

    mask_tensor = results[0].masks.data[0].cpu().numpy()
    mask_image = Image.fromarray((mask_tensor * 255).astype(np.uint8)).resize(image.size, Image.NEAREST)
    mask = np.array(mask_image) > 127
    if not mask.any():
        return _rectangular_fallback_mask(image.size, bbox), True
    mask = _largest_connected_component(mask)
    return _close_small_boundary_gaps(mask, bbox), False
