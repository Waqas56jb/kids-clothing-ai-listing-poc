from __future__ import annotations

import numpy as np
from PIL import Image

from ai_engine.utils import image_io


def _mask(height: int, width: int) -> np.ndarray:
    return np.zeros((height, width), dtype=bool)


def test_good_mask_is_usable():
    mask = _mask(100, 100)
    mask[10:90, 15:85] = True  # solid garment filling most of the box
    quality = image_io.assess_mask(mask, (5, 5, 95, 95))
    assert quality.usable
    assert 0.5 < quality.coverage < 0.98


def test_rectangle_fallback_mask_is_rejected():
    mask = _mask(100, 100)
    mask[5:95, 5:95] = True  # exactly the box -> no real separation happened
    quality = image_io.assess_mask(mask, (5, 5, 95, 95))
    assert not quality.usable
    assert quality.rejected_reason == "mask_is_whole_box"


def test_mask_that_chops_off_the_garment_is_rejected():
    mask = _mask(100, 100)
    mask[5:40, 5:95] = True  # only the top third of the box survived
    quality = image_io.assess_mask(mask, (5, 5, 95, 95))
    assert not quality.usable
    assert quality.rejected_reason == "mask_cut_off_garment"


def test_mask_with_a_big_hole_is_rejected():
    mask = _mask(100, 100)
    mask[5:95, 5:95] = True
    mask[30:70, 30:70] = False  # 20% hole punched through the middle
    mask[5:95, 90:95] = False  # keep coverage below the whole-box cutoff
    quality = image_io.assess_mask(mask, (5, 5, 95, 95))
    assert not quality.usable
    assert quality.rejected_reason == "mask_has_holes"


def test_empty_mask_is_rejected():
    quality = image_io.assess_mask(_mask(50, 50), (0, 0, 50, 50))
    assert quality.rejected_reason == "empty_mask"


def test_padded_bbox_grows_and_clamps():
    padded = image_io.pad_bbox((200, 100), (10, 10, 60, 60))
    assert padded[0] < 10 and padded[1] < 10 and padded[2] > 60 and padded[3] > 60
    edge = image_io.pad_bbox((200, 100), (0, 0, 200, 100))
    assert edge == (0, 0, 200, 100)


def test_crop_keeps_proportions():
    image = Image.new("RGB", (300, 200), "white")
    crop = image_io.crop_bbox(image, (10, 20, 110, 70))
    assert crop.size == (100, 50)


def test_apply_mask_paints_background_white_not_black():
    image = Image.new("RGB", (40, 40), (200, 30, 30))
    mask = _mask(40, 40)
    mask[10:30, 10:30] = True
    out = np.array(image_io.apply_mask(image, mask, (0, 0, 40, 40)))
    assert tuple(out[2, 2]) == (255, 255, 255)
    assert tuple(out[20, 20]) == (200, 30, 30)
