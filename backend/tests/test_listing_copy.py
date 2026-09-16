from __future__ import annotations

from ai_engine import listing_copy


def test_template_title_is_swedish_and_never_invents_brand():
    garment = {"id": "g1", "category": "bodysuit", "size": "86", "color": "vit"}
    title = listing_copy.template_title(garment)
    assert title == "Body stl 86"

    branded = listing_copy.template_title({**garment, "brand": "Polarn O. Pyret"})
    assert branded.startswith("Polarn O. Pyret Body")


def test_template_description_mentions_defects_honestly():
    garment = {
        "id": "g1",
        "category": "sweater",
        "brand": "Lindex",
        "size": "104",
        "color": "grön",
        "condition": "damaged",
        "defects": "litet hål på ärmen",
    }
    description = listing_copy.template_description(garment)
    assert "Tröja från Lindex i grön" in description
    assert "Anmärkning: litet hål på ärmen" in description
    assert "Storlek: 104" in description


def test_generate_listing_copy_falls_back_to_templates_without_api_key(monkeypatch):
    from dataclasses import replace

    monkeypatch.setattr(listing_copy, "SETTINGS", replace(listing_copy.SETTINGS, openai_api_key=None))
    copy = listing_copy.generate_listing_copy([{"id": "a", "category": "dress", "size": "92"}])
    assert copy["a"]["title"] == "Klänning stl 92"
    assert "Skick:" in copy["a"]["description"]


def test_category_labels_cover_every_canonical_key():
    from ai_engine.schemas import CATEGORY_KEYS

    for key in CATEGORY_KEYS:
        if key == "not_a_garment":
            continue
        assert listing_copy.category_sv(key) != "" and listing_copy.category_sv(key) is not None
