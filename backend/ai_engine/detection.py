from __future__ import annotations

import torch
from PIL import Image
from torchvision.ops import nms

from ai_engine.config import SETTINGS
from ai_engine.schemas import BBox, Detection

# Open-vocabulary text prompt (Grounding DINO convention: lowercase phrases
# separated by periods). Specific garment-type phrases dramatically
# out-perform a generic "clothing item." prompt on real, messy flatlay
# photos with many overlapping pieces -- see the design notes for why a
# fixed-class detector (e.g. a Fashionpedia-finetuned YOLO) was replaced
# with this: it collapsed an entire 12-item pile into one giant box.
_GARMENT_PROMPT = (
    "baby onesie. baby romper. baby dress. baby pants. baby leggings. "
    "baby hat. baby beanie. baby bib. baby jacket. baby cardigan. "
    "baby shirt. baby t-shirt. baby skirt. baby sweater. baby vest. "
    "baby shoes. baby socks. baby sleeper. baby blanket."
)

# A single garment legitimately fills most of a simple product/hanger photo
# (60-90%+ is normal), so this can only catch the truly pathological case --
# one box swallowing almost the entire frame, background included, because
# the detector mistook a whole pile for one item. Confirmed empirically:
# a real single-garment box on a plain photo measured ~64%, while the "whole
# pile" failure mode this guards against covered ~100% of the frame.
_MAX_BOX_AREA_FRACTION = 0.92
_NMS_IOU_THRESHOLD = 0.5

_processor = None
_model = None


def get_model():
    global _processor, _model
    if _model is None:
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

        cache_dir = str(SETTINGS.models_cache_dir / "hf")
        _processor = AutoProcessor.from_pretrained(SETTINGS.detector_model_id, cache_dir=cache_dir)
        _model = AutoModelForZeroShotObjectDetection.from_pretrained(SETTINGS.detector_model_id, cache_dir=cache_dir)
        _model.eval()
    return _processor, _model


def detect_garments(image: Image.Image, image_id: str, confidence_threshold: float = 0.2) -> list[Detection]:
    processor, model = get_model()

    inputs = processor(images=image, text=_GARMENT_PROMPT, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)

    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=confidence_threshold,
        text_threshold=0.2,
        target_sizes=[image.size[::-1]],
    )[0]

    boxes, scores = results["boxes"], results["scores"]
    if len(boxes) == 0:
        return []

    # Several of the prompt's phrases often fire on the same physical item
    # (e.g. "baby dress" and "baby jacket" both matching one romper) --
    # collapse those overlapping duplicates down to a single box first.
    keep = nms(boxes, scores, _NMS_IOU_THRESHOLD)

    image_area = image.size[0] * image.size[1]
    detections: list[Detection] = []
    for rank, idx in enumerate(keep.tolist()):
        x1, y1, x2, y2 = (float(v) for v in boxes[idx].tolist())
        if (x2 - x1) * (y2 - y1) / image_area > _MAX_BOX_AREA_FRACTION:
            continue
        detections.append(
            Detection(
                id=f"{image_id}_det{rank}",
                image_id=image_id,
                bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2),
                detector_confidence=float(scores[idx].item()),
            )
        )
    return detections
