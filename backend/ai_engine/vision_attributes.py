from __future__ import annotations

import base64
import json
from pathlib import Path

from ai_engine.config import SETTINGS
from ai_engine.schemas import AttributeConfidence, Attributes

_ATTRIBUTE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "description": (
                "Specific garment category, e.g. bodysuit, trousers, t-shirt, dress, "
                "jacket, sweater. If image A does not actually show a piece of "
                "clothing (e.g. it's just a hang tag, label, or empty background "
                "that the detector mistakenly boxed), set this to 'not_a_garment' "
                "and give category confidence 0 -- never invent a garment type for "
                "something that isn't one."
            ),
        },
        "brand": {"type": ["string", "null"]},
        "size": {"type": ["string", "null"]},
        "color": {"type": ["string", "null"]},
        "condition": {
            "type": ["string", "null"],
            "description": (
                "One of: new, like new, good, fair, worn, damaged. Must be "
                "'damaged' whenever `defects` is non-null, regardless of how "
                "clean the rest of the garment looks."
            ),
        },
        "defects": {
            "type": ["string", "null"],
            "description": (
                "Short, specific description of any visible flaw actually seen in "
                "the image: holes, tears/rips, fraying, stains, discoloration, "
                "missing buttons, broken zipper, pilling, etc. Null only if you "
                "looked and genuinely found nothing."
            ),
        },
        "gender": {
            "type": ["string", "null"],
            "enum": ["boys", "girls", "unisex", None],
        },
        "confidence": {
            "type": "object",
            "properties": {
                "category": {"type": "number"},
                "brand": {"type": "number"},
                "size": {"type": "number"},
                "color": {"type": "number"},
                "condition": {"type": "number"},
                "gender": {"type": "number"},
            },
            "required": ["category", "brand", "size", "color", "condition", "gender"],
            "additionalProperties": False,
        },
    },
    "required": ["category", "brand", "size", "color", "condition", "gender", "defects", "confidence"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "You are a product attribute extractor for a secondhand children's clothing "
    "marketplace. You are shown two images of the same detected item, cropped from "
    "the same seller photo:\n"
    "  - Image A: background whited out by our segmentation step, garment isolated.\n"
    "  - Image B: the same crop region from the original, unedited photo.\n"
    "Base category/brand/size/color/gender on whichever image shows it more clearly "
    "(usually A). Report every field with an honest confidence score from 0 to 1 "
    "based only on visual/text evidence actually present.\n\n"
    "Rules:\n"
    "- Never invent a brand, size, or color you cannot actually see or read. "
    "If unsure, set the field to null and give it low confidence.\n"
    "- Only set gender to 'boys' or 'girls' if there is a clear, confident visual "
    "signal (e.g. explicit boy/girl styling or print). Otherwise use 'unisex' "
    "with low confidence rather than guessing from color alone. Do not assume "
    "blue=boys or pink=girls.\n"
    "- OCR text extracted from the garment's label is provided as a hint; use it "
    "only if it plausibly matches what a real clothing label would say.\n"
    "- Before answering, deliberately scan the whole visible garment edge to edge "
    "for damage: holes, tears, rips, fraying, stains, discoloration, missing "
    "buttons, broken zippers, pilling. Only report something in `defects` if you "
    "could point to its exact location and describe its extent with genuine "
    "confidence -- a wrongly-flagged 'damaged' on a perfectly good item is far "
    "more costly here than a missed one, since a human always reviews the actual "
    "garment before it's listed or sold. Photo noise you must NOT report as "
    "damage: shadows, wrinkles/creases, folds, lighting variation, fabric weave "
    "or knit texture, print/pattern elements, and the natural unevenness of worn "
    "cotton or linen. Ribbed, waffle, or textured knits especially tend to catch "
    "studio light unevenly, producing a lighter sheen or subtle patchiness across "
    "the ridges that is texture, not a stain -- do not report that as damage "
    "unless the discoloration has a clearly different hue from the rest of the "
    "fabric (not just brightness) and an irregular, non-repeating shape. If "
    "you're not confident enough to give `condition` "
    "confidence >= 0.85, leave `defects` null and set `condition` to 'good' "
    "rather than guessing 'damaged' at low confidence -- an uncertain damage "
    "claim is worse than no claim at all.\n"
    "- Image A's cutout edge is frequently ragged or notched -- around ruffles, "
    "sleeves, collars, or wherever a tag/hanger/clip sat in the original photo -- "
    "purely because automatic background removal is imperfect there, not because "
    "the fabric is torn. Treat a gap or notch as real damage ONLY if image B (the "
    "original photo) also shows an actual hole, tear, or irregularity in the "
    "fabric at that same spot. If image B shows continuous, intact fabric there, "
    "it was a cutout artifact -- do not report it in `defects`.\n"
    "- Ruffles, frills, pleats, and gathered fabric naturally cast small shadows "
    "and gaps between folds in a normal photo -- this is fabric texture, not "
    "damage. Only call it a hole/tear if you can see the garment's base material "
    "actually breached: a gap that exposes skin, another layer, the background "
    "behind the garment, or loose/frayed thread ends. A dark or lighter patch "
    "between two folds of the same intact fabric is not damage.\n"
    "- If image A doesn't actually show a piece of clothing (e.g. it's just a "
    "hang tag, label, or stray background), set `category` to 'not_a_garment' "
    "with confidence 0 for every field rather than guessing a garment type."
)


_NULL_LOOKALIKES = {"", "null", "none", "n/a", "na", "unknown"}


def _clean_nullable(value: str | None) -> str | None:
    """Some models emit the literal text "null"/"none" for a nullable string
    field instead of actual JSON null. Treat those the same as null."""
    if value is None:
        return None
    return None if value.strip().lower() in _NULL_LOOKALIKES else value


def _encode_image(image_path: str) -> str:
    data = Path(image_path).read_bytes()
    return base64.b64encode(data).decode("utf-8")


def _image_content(image_path: str) -> dict:
    b64_image = _encode_image(image_path)
    return {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}}


def extract_attributes(
    masked_crop_path: str,
    bbox_crop_path: str,
    ocr_texts: list[str],
    detection_id: str,
) -> Attributes:
    if not SETTINGS.openai_api_key:
        return Attributes(detection_id=detection_id, unavailable=True)

    from openai import OpenAI

    client = OpenAI(api_key=SETTINGS.openai_api_key)
    ocr_hint = "; ".join(ocr_texts) if ocr_texts else "(no text detected on label)"

    response = client.chat.completions.create(
        model=SETTINGS.openai_vision_model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"OCR text detected on this garment's label: {ocr_hint}"},
                    {"type": "text", "text": "Image A (background removed):"},
                    _image_content(masked_crop_path),
                    {"type": "text", "text": "Image B (original photo, same region):"},
                    _image_content(bbox_crop_path),
                ],
            },
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "garment_attributes", "strict": True, "schema": _ATTRIBUTE_SCHEMA},
        },
    )

    payload = json.loads(response.choices[0].message.content)
    confidence = AttributeConfidence(**payload["confidence"])

    gender = payload.get("gender")
    if gender is not None and confidence.gender < SETTINGS.gender_confidence_threshold:
        gender = None

    category = (payload.get("category") or "unknown").strip().lower()
    if category in ("", "null", "none", "n/a", "not_a_garment"):
        category = "not_a_garment"

    condition = _clean_nullable(payload.get("condition"))
    defects = _clean_nullable(payload.get("defects"))

    # A "damaged" call is a real trust cost if it's wrong (a good item gets
    # discounted or pulled from a listing), while an uncertain one going
    # unflagged just means a human reviews the photo as normal -- so a
    # damage claim below this confidence gets dropped rather than shown as
    # fact, regardless of what the model's `condition` field says. This is
    # enforced here in code, not left to the prompt alone, since the
    # model's self-reported confidence on this field has proven optimistic
    # in practice (confidently wrong "damaged" calls on clean garments).
    if defects is not None and confidence.condition < SETTINGS.condition_confidence_threshold:
        defects = None
        if condition and condition.strip().lower() == "damaged":
            condition = None

    return Attributes(
        detection_id=detection_id,
        category=category,
        brand=_clean_nullable(payload.get("brand")),
        size=_clean_nullable(payload.get("size")),
        color=_clean_nullable(payload.get("color")),
        condition=condition,
        gender=gender,
        defects=defects,
        confidence=confidence,
    )
