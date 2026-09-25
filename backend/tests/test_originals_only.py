"""Product images are always the seller's own photo -- never an AI cutout
(client decision 2026-09-25). Covers new results, results stored before the
change, and what a published listing gets."""
from __future__ import annotations

import numpy as np
from PIL import Image

from ai_engine import pipeline, segmentation
from ai_engine.schemas import BBox, Detection, PipelineResult
from app.workspace import _garment_image_paths


def _legacy_result() -> dict:
    """A result exactly as stored before 2026-09-25: a clean cutout as the
    cover, plus one detection that fell back to its crop because it
    overlapped another garment."""
    return {
        "garments": [{
            "id": "garment_001", "category": "bodysuit", "confidence": {},
            "images": ["p1", "p2"], "detection_ids": ["p1_det0", "p2_det3"],
            "match_confidence": 0.9, "match_status": "high_confidence",
            "display_image": "cutouts/p1_det0.png", "original_image": "originals/p1.jpg",
            "image_variants": [
                {"detection_id": "p1_det0", "image_id": "p1", "original": "originals/p1.jpg", "crop": "crops/p1_det0.jpg",
                 "cutout": "cutouts/p1_det0.png", "display": "cutouts/p1_det0.png", "display_kind": "cutout",
                 "cutout_rejected_reason": None},
                {"detection_id": "p2_det3", "image_id": "p2", "original": "originals/p2.jpg", "crop": "crops/p2_det3.jpg",
                 "cutout": None, "display": "crops/p2_det3.jpg", "display_kind": "original",
                 "cutout_rejected_reason": "overlaps_other_garment"},
            ],
        }],
        "total_detections": 2, "total_images": 2,
    }


def test_a_stored_result_with_cutouts_is_served_with_the_sellers_own_crops():
    garment = PipelineResult.model_validate(_legacy_result()).garments[0]
    assert garment.display_image == "crops/p1_det0.jpg"
    assert [v.display for v in garment.image_variants] == ["crops/p1_det0.jpg", "crops/p2_det3.jpg"]
    assert all(v.display_kind == "original" for v in garment.image_variants)
    dumped = PipelineResult.model_validate(_legacy_result()).model_dump_json()
    assert "cutout" not in dumped


def test_a_stored_overlap_rejection_becomes_the_occluded_flag():
    variants = PipelineResult.model_validate(_legacy_result()).garments[0].image_variants
    assert [v.occluded for v in variants] == [False, True]


def test_a_published_listing_gets_crops_then_full_photos_and_never_a_cutout():
    garment = PipelineResult.model_validate(_legacy_result()).garments[0].model_dump()
    paths, cover = _garment_image_paths(garment)
    assert cover == "crops/p1_det0.jpg"
    assert paths == ["crops/p1_det0.jpg", "crops/p2_det3.jpg", "originals/p1.jpg", "originals/p2.jpg"]


def test_publishing_maps_a_raw_legacy_cutout_path_back_to_its_crop():
    # Even a raw dict that never went through the models.
    paths, cover = _garment_image_paths({"display_image": "cutouts/x_det1.png", "image_variants": []})
    assert cover == "crops/x_det1.jpg" and paths == ["crops/x_det1.jpg"]


def test_preparing_a_detection_writes_only_the_crop(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline.ocr, "extract_text_from_image", lambda image: ([], 0.0))
    seen = []
    monkeypatch.setattr(pipeline.embeddings, "embed_garment", lambda image: seen.append(image.size) or np.zeros(4))
    image = Image.new("RGB", (200, 200), "white")
    mask = np.zeros((200, 200), dtype=bool)
    mask[40:160, 40:160] = True
    det = Detection(id="p1_det0", image_id="p1", bbox=BBox(x1=40, y1=40, x2=160, y2=160), detector_confidence=0.9)

    prepared, crop = pipeline._prepare_detection(det, image, "originals/p1.jpg", tmp_path, mask, False, False)

    assert prepared.images.display == "crops/p1_det0.jpg" == prepared.images.crop
    assert (tmp_path / "crops" / "p1_det0.jpg").exists()
    assert not (tmp_path / "cutouts").exists()
    assert [p.name for p in tmp_path.rglob("*") if p.is_file()] == ["p1_det0.jpg"]
    assert len(seen) == 1  # the matcher's embedding is still computed, in memory only


def test_segmenting_many_boxes_never_misassigns_masks_when_sam2_returns_fewer(monkeypatch):
    class _Masks:
        def __init__(self, n):
            self.data = [_Tensor() for _ in range(n)]

    class _Tensor:
        def cpu(self):
            return self

        def numpy(self):
            m = np.zeros((10, 10), dtype=np.float32)
            m[2:8, 2:8] = 1
            return m

    class _Result:
        def __init__(self, n):
            self.masks = _Masks(n)

    calls = []

    def fake_model(image, bboxes, verbose=False):
        calls.append(len(bboxes))
        return [_Result(1 if len(bboxes) > 1 else len(bboxes))]  # drops masks when batched

    monkeypatch.setattr(segmentation, "get_model", lambda: fake_model)
    out = segmentation.segment_garments(Image.new("RGB", (10, 10)), [(0, 0, 5, 5), (5, 5, 10, 10), (0, 5, 5, 10)])
    assert len(out) == 3
    assert calls == [3, 1, 1, 1]  # fell back to one box at a time instead of guessing
