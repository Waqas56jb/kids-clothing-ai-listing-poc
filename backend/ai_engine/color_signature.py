"""The garment's measured colour, from its own mask pixels.

CLIP embeddings barely tell apart two plain baby bodysuits of the same cut
(measured on a client pile: a khaki and a rose-brown bodysuit at 0.85-0.93,
their own re-shots at 0.85-0.93 too), and the vision model's colour words
don't either -- both came back "brun". The pixels do: a median colour in
CIELAB (perceptual lightness L, green-red a, blue-yellow b) separates them
by a wide margin, and stays put when the same garment is photographed again.
"""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# Ignore the outer rim of the mask: SAM2 edges can carry a sliver of floor.
_ERODE_FRACTION = 0.01
_MIN_PIXELS = 400


def garment_color(image: Image.Image, mask: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray | None:
    """[L, a, b] medians and the spread of L (a print is spread, a plain
    fabric isn't), or None when the mask is too small to trust."""
    x1, y1, x2, y2 = bbox
    box_mask = mask[y1:y2, x1:x2].astype(np.uint8)
    diagonal = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    size = max(3, int(diagonal * _ERODE_FRACTION)) | 1
    eroded = cv2.erode(box_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    if int(eroded.sum()) >= _MIN_PIXELS:
        box_mask = eroded
    if int(box_mask.sum()) < _MIN_PIXELS:
        return None
    rgb = np.asarray(image.convert("RGB"))[y1:y2, x1:x2]
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    pixels = lab[box_mask.astype(bool)]
    # OpenCV's 8-bit Lab: L scaled to 0-255, a and b offset by 128.
    L = pixels[:, 0] * (100.0 / 255.0)
    a = pixels[:, 1] - 128.0
    b = pixels[:, 2] - 128.0
    p25, p75 = np.percentile(L, [25, 75])
    return np.array([np.median(L), np.median(a), np.median(b), p75 - p25], dtype=np.float32)
