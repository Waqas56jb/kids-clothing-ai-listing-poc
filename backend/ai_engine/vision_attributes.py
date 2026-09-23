from __future__ import annotations

import base64
import io
import json

from PIL import Image

from ai_engine.config import SETTINGS
from ai_engine.schemas import CATEGORY_KEYS, CONDITION_KEYS, AttributeConfidence, Attributes
from ai_engine.utils import image_io

_ATTRIBUTE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": CATEGORY_KEYS,
            "description": (
                "The garment type, chosen from the allowed keys. If image A does not "
                "actually show a piece of clothing (e.g. it's just a hang tag, label, or "
                "empty background that the detector mistakenly boxed), use "
                "'not_a_garment' and give category confidence 0 -- never invent a "
                "garment type for something that isn't one."
            ),
        },
        "brand": {"type": ["string", "null"], "description": "Brand name exactly as printed on the label, or null."},
        "size": {
            "type": ["string", "null"],
            "description": "Size exactly as printed (e.g. '86', '92/98', '2-3 år', '6M'), or null.",
        },
        "color": {
            "type": ["string", "null"],
            "description": (
                "Main color(s) and pattern IN SWEDISH, short and natural, e.g. 'vit', "
                "'ljusblå med vita ränder', 'rosa blommig', 'mörkgrön'."
            ),
        },
        "condition": {
            "type": ["string", "null"],
            "enum": CONDITION_KEYS + [None],
            "description": (
                "One of: new, like new, good, fair, worn, damaged. Must be 'damaged' "
                "whenever `defects` is non-null, regardless of how clean the rest of "
                "the garment looks."
            ),
        },
        "defects": {
            "type": ["string", "null"],
            "description": (
                "Short, specific description IN SWEDISH of any visible flaw actually "
                "seen in the image: hål, revor, fransning, fläckar, missfärgning, "
                "saknade knappar, trasig dragkedja, noppor. Null only if you looked "
                "and genuinely found nothing."
            ),
        },
        "gender": {
            "type": ["string", "null"],
            "enum": ["boys", "girls", "unisex", None],
        },
        "cutout_looks_complete": {
            "type": ["boolean", "null"],
            "description": (
                "Only meaningful when Image B was provided; null if it was not. true "
                "only if Image B genuinely shows the WHOLE garment cleanly -- the same "
                "overall shape and extent as Image A, with no chunk of the garment "
                "missing or cut off, no ragged/torn-looking edge that Image A does not "
                "actually show as damaged, and no stray background or foreign object "
                "bled into it. false if any of that is wrong: part of the garment "
                "visible in Image A is missing from Image B, Image B's silhouette looks "
                "torn/distorted/incomplete compared to the real garment in Image A, or "
                "Image B includes something that isn't this garment. When in doubt, "
                "answer false -- a real photo of the garment is always better than a "
                "questionable cutout."
            ),
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
    "required": [
        "category", "brand", "size", "color", "condition", "gender", "defects",
        "cutout_looks_complete", "confidence",
    ],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "You are a product attribute extractor for Miniplagg, a Swedish secondhand "
    "children's clothing marketplace. You are shown two images of the same detected "
    "item, cropped from the same seller photo:\n"
    "  - Image A: the crop region from the original, unedited photo (primary evidence).\n"
    "  - Image B: the same crop with the background whited out by our segmentation "
    "step, when available -- it may be imperfect at the edges.\n"
    "Base category/brand/size/color/gender on whichever image shows it more clearly. "
    "Report every field with an honest confidence score from 0 to 1 based only on "
    "visual/text evidence actually present.\n\n"
    "Language: write `color` and `defects` in natural Swedish. Keep `brand` and `size` "
    "exactly as printed on the label. `category`, `condition` and `gender` are fixed "
    "keys (choose from the allowed values).\n\n"
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
    "fabric (not just brightness) and an irregular, non-repeating shape. Frilled, "
    "pinked, scalloped, or crocheted-look trim edges (common on ruffled sleeves, "
    "collars, and hems) are *designed* to look irregular and slightly frayed at "
    "close range -- that is the finished product, not damage, unless individual "
    "threads are visibly pulled loose and dangling. Button plackets, snap "
    "closures, and seam allowances create small gaps and puckers by "
    "construction -- do not read those as holes. When genuinely unsure whether "
    "something is a design/construction detail or real damage, treat it as a "
    "design detail: only call it a defect if you're confident a repair would "
    "actually be needed. Leave `defects` null and `condition` 'good' rather than "
    "guess -- an uncertain damage claim is worse than no claim at all.\n"
    "- Image B's cutout edge is frequently ragged or notched -- around ruffles, "
    "sleeves, collars, or wherever a tag/hanger/clip sat in the original photo -- "
    "purely because automatic background removal is imperfect there, not because "
    "the fabric is torn. Treat a gap or notch as real damage ONLY if image A (the "
    "original photo) also shows an actual hole, tear, or irregularity in the "
    "fabric at that same spot. If image A shows continuous, intact fabric there, "
    "it was a cutout artifact -- do not report it in `defects`.\n"
    "- Ruffles, frills, pleats, and gathered fabric naturally cast small shadows "
    "and gaps between folds in a normal photo -- this is fabric texture, not "
    "damage. Only call it a hole/tear if you can see the garment's base material "
    "actually breached: a gap that exposes skin, another layer, the background "
    "behind the garment, or loose/frayed thread ends. A dark or lighter patch "
    "between two folds of the same intact fabric is not damage.\n"
    "- If the crop doesn't actually show a piece of clothing (e.g. it's just a "
    "hang tag, label, or stray background), set `category` to 'not_a_garment' "
    "with confidence 0 for every field rather than guessing a garment type.\n"
    "- `cutout_looks_complete` is a separate judgment from `defects`, and the two "
    "often disagree on purpose: a cutout artifact (a ragged edge from imperfect "
    "background removal, not real fabric damage) correctly stays out of `defects`, "
    "but it still means Image B is not a good, presentable photo of the garment -- "
    "set `cutout_looks_complete` to false in exactly that case. Compare the two "
    "images directly: if Image B is missing an arm, leg, collar, hem, or other "
    "chunk that Image A clearly shows, if its outline looks torn, patchy, or "
    "eaten-into rather than following the garment's real edge, or if a visible "
    "patch of background, another object, or a different garment shows up inside "
    "Image B's silhouette, that is false, regardless of how confident you are "
    "about the other fields. true is reserved for a cutout you would be "
    "comfortable showing a buyer as the product photo exactly as it is."
)


_NULL_LOOKALIKES = {"", "null", "none", "n/a", "na", "unknown", "okänd", "okänt", "ingen", "inga"}


def _clean_nullable(value: str | None) -> str | None:
    """Some models emit the literal text "null"/"none" for a nullable string
    field instead of actual JSON null. Treat those the same as null."""
    if value is None:
        return None
    return None if value.strip().lower() in _NULL_LOOKALIKES else value


def _encode_image(image: Image.Image) -> str:
    """JPEG-encode a downscaled copy in memory: smaller payloads mean faster
    round-trips with no loss of label legibility at this size."""
    small = image_io.downscaled_copy(image.convert("RGB"), SETTINGS.vision_image_max_px)
    buffer = io.BytesIO()
    small.save(buffer, format="JPEG", quality=88)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _image_content(image: Image.Image) -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_encode_image(image)}", "detail": "high"}}


_OVERLAP_HINT = (
    "Note: our segmentation step detected that this item overlaps or touches another "
    "garment in the photo, so part of it may be physically hidden and the visible "
    "portion can look unusual in isolation -- a bunched collar, hood, sleeve, waistband, "
    "or fold peeking out from under another garment can look like a hat, beanie, "
    "mittens, socks, or scarf out of context. Judge the category only from fabric/"
    "structure you can actually see; if the visible portion is too small, cropped, or "
    "ambiguous to be genuinely sure of the garment type, give category a low confidence "
    "rather than a confident guess -- especially before choosing a small accessory "
    "category over a larger garment category."
)


def extract_attributes(
    original_crop: Image.Image,
    cutout_crop: Image.Image | None,
    ocr_texts: list[str],
    detection_id: str,
    overlaps_other_garment: bool = False,
) -> Attributes:
    if not SETTINGS.openai_api_key:
        return Attributes(detection_id=detection_id, unavailable=True)

    from ai_engine import openai_throttle

    client = openai_throttle.get_client()
    ocr_hint = "; ".join(ocr_texts) if ocr_texts else "(no text detected on label)"

    content: list[dict] = [
        {"type": "text", "text": f"OCR text detected on this garment's label: {ocr_hint}"},
    ]
    if overlaps_other_garment:
        content.append({"type": "text", "text": _OVERLAP_HINT})
    content.append({"type": "text", "text": "Image A (original photo, crop region):"})
    content.append(_image_content(original_crop))
    if cutout_crop is not None:
        content.append({"type": "text", "text": "Image B (background removed, may be imperfect at edges):"})
        content.append(_image_content(cutout_crop))

    def request():
        return client.chat.completions.create(
            model=SETTINGS.openai_vision_model,
            temperature=0,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "garment_attributes", "strict": True, "schema": _ATTRIBUTE_SCHEMA},
            },
        )

    estimate = SETTINGS.openai_vision_tokens_per_call
    openai_throttle.VISION_BUDGET.acquire(estimate)
    response = openai_throttle.call_with_rate_limit_retry(request, label=detection_id)
    openai_throttle.VISION_BUDGET.settle(estimate, openai_throttle.usage_total_tokens(response))

    payload = json.loads(response.choices[0].message.content)
    confidence = AttributeConfidence(**payload["confidence"])

    gender = payload.get("gender")
    if gender is not None and confidence.gender < SETTINGS.gender_confidence_threshold:
        gender = None

    category = (payload.get("category") or "unknown").strip().lower()
    if category in ("", "null", "none", "n/a", "not_a_garment"):
        category = "not_a_garment"
    elif category not in CATEGORY_KEYS:
        category = "other"

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

    # Only meaningful when we actually showed the model a cutout; ignore
    # whatever it says otherwise rather than trust a judgment about an
    # image it never saw.
    cutout_looks_complete = payload.get("cutout_looks_complete") if cutout_crop is not None else None

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
        cutout_looks_complete=cutout_looks_complete,
    )
