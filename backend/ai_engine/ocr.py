from __future__ import annotations

_ocr_engine = None


def _load():
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR

        _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")
    return _ocr_engine


def warm_up() -> None:
    _load()


def _get(result_obj, key: str):
    if hasattr(result_obj, key):
        return getattr(result_obj, key)
    if isinstance(result_obj, dict):
        return result_obj.get(key)
    return None


def extract_text(image_path: str) -> tuple[list[str], float]:
    """Run OCR on a saved crop. Returns (texts, average_confidence).

    Never raises — OCR is a best-effort evidence signal for the vision/
    matching steps, not something that should halt the pipeline if a given
    crop is too small/blurry for the engine to read.
    """
    try:
        engine = _load()
        results = engine.predict(image_path)
    except Exception:
        return [], 0.0

    texts: list[str] = []
    scores: list[float] = []
    for res in results or []:
        rec_texts = _get(res, "rec_texts") or []
        rec_scores = _get(res, "rec_scores") or []
        texts.extend(str(t) for t in rec_texts)
        scores.extend(float(s) for s in rec_scores)

    avg_confidence = sum(scores) / len(scores) if scores else 0.0
    return texts, avg_confidence
