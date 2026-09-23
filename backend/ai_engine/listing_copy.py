from __future__ import annotations

import json
from typing import Any

from ai_engine.config import SETTINGS

# Swedish labels for the canonical keys -- the same vocabulary the frontends
# use, kept here so server-generated copy and UI badges never disagree.
CATEGORY_SV = {
    "bodysuit": "Body",
    "onesie": "Sparkdräkt",
    "romper": "Jumpsuit",
    "sleeper": "Pyjamas",
    "pajamas": "Pyjamas",
    "dress": "Klänning",
    "skirt": "Kjol",
    "t-shirt": "T-shirt",
    "top": "Topp",
    "shirt": "Skjorta",
    "blouse": "Blus",
    "sweater": "Tröja",
    "hoodie": "Huvtröja",
    "sweatshirt": "Sweatshirt",
    "cardigan": "Kofta",
    "jacket": "Jacka",
    "coat": "Kappa",
    "vest": "Väst",
    "trousers": "Byxor",
    "pants": "Byxor",
    "jeans": "Jeans",
    "leggings": "Leggings",
    "shorts": "Shorts",
    "overalls": "Hängselbyxor",
    "socks": "Strumpor",
    "tights": "Strumpbyxor",
    "hat": "Mössa",
    "beanie": "Mössa",
    "mittens": "Vantar",
    "scarf": "Halsduk",
    "shoes": "Skor",
    "swimwear": "Badkläder",
    "accessory": "Accessoar",
    "other": "Plagg",
    "unknown": "Plagg",
}

CONDITION_SV = {
    "new": "Ny",
    "like new": "Som ny",
    "good": "Bra skick",
    "fair": "Okej skick",
    "worn": "Sliten",
    "damaged": "Skadad",
}

GENDER_SV = {"boys": "Pojke", "girls": "Flicka", "unisex": "Unisex"}


def category_sv(key: str | None) -> str:
    return CATEGORY_SV.get((key or "").lower(), "Plagg")


def condition_sv(key: str | None) -> str | None:
    if not key:
        return None
    return CONDITION_SV.get(key.lower(), key)


def template_title(garment: dict[str, Any]) -> str:
    parts = [garment.get("brand"), category_sv(garment.get("category"))]
    if garment.get("size"):
        parts.append(f"stl {garment['size']}")
    return " ".join(str(part) for part in parts if part)


def template_description(garment: dict[str, Any]) -> str:
    """Honest Swedish fallback copy built only from detected attributes --
    never invents a brand, size, or color that wasn't actually read."""
    category = category_sv(garment.get("category"))
    lines: list[str] = []
    intro = f"{category}"
    if garment.get("brand"):
        intro += f" från {garment['brand']}"
    if garment.get("color"):
        intro += f" i {garment['color']}"
    if garment.get("defects"):
        intro += ". Observera: möjligt slitage har noterats – kontrollera plagget innan publicering"
    else:
        cond = condition_sv(garment.get("condition")) or "bra skick"
        intro += f", {cond.lower()}"
    lines.append(intro + ".")
    lines.append("")
    if garment.get("brand"):
        lines.append(f"Märke: {garment['brand']}")
    if garment.get("size"):
        lines.append(f"Storlek: {garment['size']}")
    if garment.get("color"):
        lines.append(f"Färg: {garment['color']}")
    lines.append(f"Skick: {condition_sv(garment.get('condition')) or 'Bra skick'}")
    if garment.get("defects"):
        lines.append(f"Anmärkning: {garment['defects']}")
    if garment.get("gender"):
        lines.append(f"Passar: {GENDER_SV.get(garment['gender'], garment['gender'])}")
    lines.append("")
    lines.append("Skickas snabbt. Fråga gärna om fler bilder.")
    return "\n".join(lines)


_COPY_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["id", "title", "description"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = (
    "Du skriver annonstexter på svenska för Miniplagg, en marknadsplats för "
    "begagnade barnkläder. För varje plagg får du de attribut vår AI faktiskt "
    "läste av (kategori, märke, storlek, färg, skick, eventuella anmärkningar). "
    "Skriv en kort, säljande men ärlig titel (max 60 tecken) och en beskrivning "
    "(2–4 korta stycken eller rader, max 600 tecken) på naturlig svenska.\n\n"
    "Regler:\n"
    "- Hitta ALDRIG på märke, storlek, material, ålder eller färg som inte finns i "
    "attributen. Saknas märke – nämn det inte.\n"
    "- Om 'anmärkning' finns måste den nämnas tydligt och ärligt i beskrivningen.\n"
    "- Använd svenska barnklädestermer (body, sparkdräkt, tröja, byxor, klänning, "
    "kofta, jacka, mössa osv.) och skriv storlek som 'stl 86'.\n"
    "- Inga emojis, inga versaler i utropsstil, inga påhittade priser.\n"
    "- Returnera exakt ett objekt per plagg med samma id som skickades in."
)


def _attrs_for_prompt(garment: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": garment["id"],
        "kategori": category_sv(garment.get("category")),
        "märke": garment.get("brand"),
        "storlek": garment.get("size"),
        "färg": garment.get("color"),
        "skick": condition_sv(garment.get("condition")),
        "anmärkning": garment.get("defects"),
        "passar": GENDER_SV.get(garment.get("gender") or "", None),
    }


def generate_listing_copy(garments: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """Return {garment_id: {"title", "description"}} in Swedish.

    One batched text-model call per job (not one per garment) keeps API calls
    and latency low; any failure falls back to the honest template so the
    seller always gets editable Swedish copy.
    """
    fallback = {g["id"]: {"title": template_title(g), "description": template_description(g)} for g in garments}
    if not garments or not SETTINGS.openai_api_key:
        return fallback

    try:
        from ai_engine import openai_throttle

        client = openai_throttle.get_client()
        copy: dict[str, dict[str, str]] = dict(fallback)
        # Keep each request modest in size so a 30-photo batch never hits
        # output limits: ~15 garments per call.
        for start in range(0, len(garments), 15):
            chunk = garments[start : start + 15]

            def request(chunk=chunk):
                return client.chat.completions.create(
                    model=SETTINGS.openai_text_model,
                    temperature=0.4,
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": "Plagg (JSON):\n" + json.dumps([_attrs_for_prompt(g) for g in chunk], ensure_ascii=False),
                        },
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": "listing_copy", "strict": True, "schema": _COPY_SCHEMA},
                    },
                )

            response = openai_throttle.call_with_rate_limit_retry(request, label="listing_copy")
            payload = json.loads(response.choices[0].message.content)
            for item in payload.get("items") or []:
                gid = item.get("id")
                if gid in copy and item.get("title") and item.get("description"):
                    title = item["title"].strip()[:80]
                    copy[gid] = {
                        "title": title[:1].upper() + title[1:],
                        "description": item["description"].strip()[:1200],
                    }
        return copy
    except Exception as exc:  # noqa: BLE001 -- copy is best-effort, template still works
        print(f"[listing_copy] generation failed, using template copy: {exc}")
        return fallback
