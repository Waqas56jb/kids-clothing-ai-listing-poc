"""The measured garment colour: median CIELAB of the mask's own pixels."""
from __future__ import annotations

import numpy as np
from PIL import Image

from ai_engine.color_signature import garment_color
from ai_engine.matching import measured_color_score


def _photo(garment_rgb, floor_rgb=(120, 80, 40)):
    arr = np.zeros((200, 200, 3), dtype=np.uint8)
    arr[:] = floor_rgb
    arr[50:150, 50:150] = garment_rgb
    mask = np.zeros((200, 200), dtype=bool)
    mask[50:150, 50:150] = True
    return Image.fromarray(arr), mask


def test_only_the_garment_pixels_are_measured_not_the_floor():
    image, mask = _photo((230, 230, 230))
    L, a, b, spread = garment_color(image, mask, (30, 30, 170, 170))
    assert L > 85 and abs(a) <= 2 and abs(b) <= 2 and spread < 1


def test_the_khaki_and_rose_brown_bodysuits_are_told_apart():
    # Median colours measured on the client's pile (job 9863ed6fa8c0).
    khaki = [np.array(c) for c in ([36.86, 5.0, 19.0, 4.7], [37.25, 6.0, 22.0, 5.1], [40.39, 5.0, 18.0, 5.5])]
    rose = [np.array(c) for c in ([40.78, 9.0, 11.0, 6.7], [43.92, 11.0, 11.0, 6.7], [42.35, 10.0, 14.0, 6.7])]
    same = min(measured_color_score(x, y) for group in (khaki, rose) for x in group for y in group)
    across = max(measured_color_score(x, y) for x in khaki for y in rose)
    assert same > across  # every re-shot pair beats every look-alike pair


def test_no_measurement_is_neutral():
    assert measured_color_score(None, np.array([50.0, 0.0, 0.0, 5.0])) == 0.5


def test_a_mask_too_small_to_trust_gives_no_measurement():
    image, _ = _photo((230, 230, 230))
    mask = np.zeros((200, 200), dtype=bool)
    mask[60:70, 60:70] = True
    assert garment_color(image, mask, (30, 30, 170, 170)) is None
