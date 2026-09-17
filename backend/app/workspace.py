from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ai_engine.listing_copy import template_description, template_title
from ai_engine.schemas import PipelineResult

from app import db

EDITABLE_FIELDS = ("category", "brand", "size", "color", "condition", "gender", "defects")

# Illustrative base price ranges (SEK) by category. Pricing is always shown
# to the seller as an AI suggestion they accept, edit, or reject.
CATEGORY_BASE = {
    "bodysuit": (30, 50),
    "onesie": (30, 50),
    "romper": (35, 60),
    "sleeper": (35, 60),
    "pajamas": (35, 60),
    "dress": (50, 90),
    "skirt": (30, 55),
    "t-shirt": (25, 45),
    "top": (25, 45),
    "shirt": (30, 60),
    "blouse": (30, 60),
    "sweater": (50, 90),
    "hoodie": (50, 90),
    "sweatshirt": (45, 80),
    "cardigan": (45, 80),
    "jacket": (80, 150),
    "coat": (90, 160),
    "vest": (40, 70),
    "trousers": (30, 55),
    "pants": (30, 55),
    "jeans": (35, 65),
    "leggings": (25, 45),
    "shorts": (25, 45),
    "overalls": (60, 120),
    "socks": (10, 25),
    "tights": (15, 30),
    "hat": (15, 30),
    "beanie": (15, 30),
    "mittens": (15, 30),
    "scarf": (15, 35),
    "shoes": (60, 150),
    "swimwear": (30, 60),
    "accessory": (15, 40),
    "default": (30, 60),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _hash(value: str) -> int:
    total = 0
    for char in value:
        total = (total * 31 + ord(char)) & 0xFFFFFFFF
    return total


def _seeded(value: str) -> float:
    return (_hash(value) % 10000) / 10000


def _round5(value: float) -> int:
    return int(round(value / 5) * 5)


def compute_groups(garments: list[dict[str, Any]]) -> dict[str, Any]:
    by_key: dict[str, dict[str, Any]] = {}
    for garment in garments:
        key = f"{garment.get('size') or 'okänd storlek'}|{garment.get('category')}"
        if key not in by_key:
            by_key[key] = {
                "id": key,
                "size": garment.get("size") or "Okänd storlek",
                "category": garment.get("category"),
                "garmentIds": [],
            }
        by_key[key]["garmentIds"].append(garment["id"])
    groups = []
    ungrouped = []
    for group in by_key.values():
        if len(group["garmentIds"]) > 1:
            groups.append(group)
        else:
            ungrouped.extend(group["garmentIds"])
    return {"groups": groups, "ungrouped": ungrouped}


def generate_title(garment: dict[str, Any]) -> str:
    return garment.get("listing_title") or template_title(garment)


def generate_description(garment: dict[str, Any]) -> str:
    return garment.get("listing_description") or template_description(garment)


def _mock_price(attrs: dict[str, Any]) -> dict[str, Any]:
    category = str(attrs.get("category") or "default").lower()
    base_min, base_max = CATEGORY_BASE.get(category, CATEGORY_BASE["default"])
    seed = _seeded(f"{attrs.get('category')}|{attrs.get('brand')}|{attrs.get('size')}|{attrs.get('id') or ''}")
    brand_boost = 1.15 if attrs.get("brand") else 1
    condition_factor = {
        "good": 1,
        "like new": 1.2,
        "new": 1.35,
        "fair": 0.8,
        "damaged": 0.55,
        "worn": 0.7,
    }.get(str(attrs.get("condition") or "").lower(), 0.9)
    spread = 1 + (seed - 0.5) * 0.3
    min_price = max(10, _round5(base_min * brand_boost * condition_factor * spread))
    max_price = max(min_price + 10, _round5(base_max * brand_boost * condition_factor * spread))
    recommended = _round5((min_price + max_price) / 2)
    known = len([key for key in ("brand", "size", "condition") if attrs.get(key)])
    confidence = min(0.92, 0.4 + known * 0.15 + seed * 0.1)
    return {
        "minPrice": min_price,
        "maxPrice": max_price,
        "recommendedPrice": recommended,
        "confidence": confidence,
        "status": "needs_review" if confidence < 0.65 else "ai_calculated",
    }


def _garment_pricing(job_id: str, garment: dict[str, Any]) -> dict[str, Any]:
    pricing_id = f"garment:{job_id}:{garment['id']}"
    computed = _mock_price(
        {
            "kind": "garment",
            "id": garment["id"],
            "category": garment.get("category"),
            "brand": garment.get("brand"),
            "size": garment.get("size"),
            "condition": "damaged" if garment.get("defects") else garment.get("condition"),
            "color": garment.get("color"),
            "gender": garment.get("gender"),
        }
    )
    return {
        "id": pricing_id,
        "garmentId": garment["id"],
        "groupId": None,
        "jobId": job_id,
        "currency": "SEK",
        **computed,
        "reason": "Uppskattat utifrån kategori, märke och skick.",
        "finalPrice": None,
        "adjustedBy": None,
        "adjustedAt": None,
        "note": None,
        "meta": {
            "category": garment.get("category"),
            "brand": garment.get("brand"),
            "size": garment.get("size"),
            "condition": garment.get("condition"),
            "color": garment.get("color"),
            "gender": garment.get("gender"),
            "itemCount": 1,
        },
    }


def _group_pricing(job_id: str, group: dict[str, Any]) -> dict[str, Any]:
    pricing_id = f"group:{job_id}:{group['id']}"
    computed = _mock_price({"kind": "group", "id": group["id"], "category": group.get("category"), "size": group.get("size")})
    count = max(1, len(group.get("garmentIds") or []))
    discount = 0.85
    min_price = _round5(computed["minPrice"] * count * discount)
    max_price = _round5(computed["maxPrice"] * count * discount)
    recommended = _round5((min_price + max_price) / 2)
    return {
        "id": pricing_id,
        "garmentId": None,
        "groupId": group["id"],
        "jobId": job_id,
        "currency": "SEK",
        "minPrice": min_price,
        "maxPrice": max_price,
        "recommendedPrice": recommended,
        "confidence": computed["confidence"],
        "status": computed["status"],
        "reason": "Uppskattat paketpris utifrån kategori, storlek och antal plagg.",
        "finalPrice": None,
        "adjustedBy": None,
        "adjustedAt": None,
        "note": None,
        "meta": {
            "category": group.get("category"),
            "size": group.get("size"),
            "itemCount": count,
        },
    }


def garments_from_result(result: PipelineResult | dict | None) -> list[dict[str, Any]]:
    if result is None:
        return []
    data = result.model_dump() if hasattr(result, "model_dump") else result
    return list(data.get("garments") or [])


def seed_workspace(job_id: str, result: PipelineResult | dict | None) -> dict[str, Any]:
    garments = garments_from_result(result)
    current = db.get_workspace(job_id)
    groups = current.get("groups") or compute_groups(garments)
    listings = dict(current.get("listings") or {})
    for garment in garments:
        listings.setdefault(
            garment["id"],
            {
                "title": generate_title(garment),
                "description": generate_description(garment),
                "status": "draft",
            },
        )
    pricing = dict(current.get("pricing") or {})
    for garment in garments:
        pricing.setdefault(f"garment:{job_id}:{garment['id']}", _garment_pricing(job_id, garment))
    for group in groups.get("groups") or []:
        pricing.setdefault(f"group:{job_id}:{group['id']}", _group_pricing(job_id, group))
    current.update(
        {
            "garment_edits": current.get("garment_edits") or {},
            "match_decisions": current.get("match_decisions") or {},
            "groups": groups,
            "listings": listings,
            "pricing": pricing,
            "pricing_history": current.get("pricing_history") or {},
        }
    )
    return db.set_workspace(job_id, current)


def apply_to_result(result: dict[str, Any] | None, workspace: dict[str, Any] | None) -> dict[str, Any] | None:
    if not result:
        return result
    workspace = workspace or {}
    edits = workspace.get("garment_edits") or {}
    decisions = workspace.get("match_decisions") or {}
    removed = workspace.get("removed_images") or {}
    for garment in result.get("garments") or []:
        extra = edits.get(garment.get("id")) or {}
        for field in EDITABLE_FIELDS:
            if field in extra and extra[field] is not None:
                garment[field] = extra[field]
        if garment.get("id") in decisions:
            garment["match_decision"] = decisions[garment["id"]]
        gone = set(removed.get(garment.get("id")) or [])
        if gone:
            _drop_images(garment, gone)
    return result


def _drop_images(garment: dict[str, Any], gone: set[str]) -> None:
    """Hide detection images the seller/admin deleted, keeping at least one."""
    kept_ids = [det_id for det_id in garment.get("detection_ids") or [] if det_id not in gone]
    if not kept_ids:
        return
    garment["detection_ids"] = kept_ids
    variants = [v for v in garment.get("image_variants") or [] if v.get("detection_id") not in gone]
    garment["image_variants"] = variants
    if variants:
        garment["images"] = sorted({v["image_id"] for v in variants})
        cover = next((v for v in variants if v.get("display_kind") == "cutout"), variants[0])
        garment["display_image"] = cover.get("display")
        garment["original_image"] = cover.get("original")
    garment["removed_detection_ids"] = sorted(gone)


def remove_garment_image(job_id: str, garment_id: str, detection_id: str, current: list[str]) -> dict[str, Any]:
    """Record a deleted image; refuses to delete the last remaining one."""
    workspace = db.get_workspace(job_id)
    removed = dict(workspace.get("removed_images") or {})
    already = set(removed.get(garment_id) or [])
    remaining = [det_id for det_id in current if det_id not in already and det_id != detection_id]
    if not remaining:
        raise ValueError("Ett plagg måste ha minst en bild kvar.")
    already.add(detection_id)
    removed[garment_id] = sorted(already)
    return db.set_workspace(job_id, {**workspace, "removed_images": removed})


def mutate_pricing(job_id: str, pricing_id: str, action: str, actor: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    workspace = db.get_workspace(job_id)
    pricing = dict(workspace.get("pricing") or {})
    record = pricing.get(pricing_id)
    if not record:
        raise KeyError(pricing_id)
    history = dict(workspace.get("pricing_history") or {})
    entries = list(history.get(pricing_id) or [])
    previous = record.get("finalPrice")
    payload = payload or {}
    now = _now()
    if action == "approve":
        record["status"] = "approved"
        record["finalPrice"] = record.get("recommendedPrice")
        reason = "Godkände AI:s prisförslag"
    elif action == "reject":
        record["status"] = "rejected"
        record["finalPrice"] = None
        reason = payload.get("note") or "Avvisade AI:s prisförslag"
    else:
        if payload.get("minPrice") is not None:
            record["minPrice"] = payload["minPrice"]
        if payload.get("maxPrice") is not None:
            record["maxPrice"] = payload["maxPrice"]
        if payload.get("finalPrice") is not None:
            record["finalPrice"] = payload["finalPrice"]
        record["status"] = "manually_adjusted"
        reason = payload.get("note") or "Manuell prisjustering"
    record["adjustedBy"] = actor
    record["adjustedAt"] = now
    if payload.get("note"):
        record["note"] = payload["note"]
    pricing[pricing_id] = record
    entries.append(
        {
            "id": f"{pricing_id}:{len(entries)}",
            "pricingId": pricing_id,
            "changedBy": actor,
            "date": now,
            "previousPrice": previous,
            "newPrice": record.get("finalPrice"),
            "reason": reason,
        }
    )
    history[pricing_id] = entries
    db.set_workspace(job_id, {**workspace, "pricing": pricing, "pricing_history": history})
    return record


def list_all_pricing() -> list[dict[str, Any]]:
    rows = db.list_jobs()
    items: list[dict[str, Any]] = []
    for row in rows:
        workspace = dict(row.get("workspace") or {})
        items.extend((workspace.get("pricing") or {}).values())
    return items


def _garment_image_paths(garment: dict[str, Any]) -> tuple[list[str], str | None]:
    """All distinct image paths for a garment (cover first), never inventing
    a cutout that didn't pass the quality gate."""
    paths: list[str] = []
    cover = garment.get("display_image")
    if cover:
        paths.append(cover)
    for variant in garment.get("image_variants") or []:
        for key in ("display", "crop", "original"):
            path = variant.get(key)
            if path and path not in paths:
                paths.append(path)
    if not paths:
        for det_id in garment.get("detection_ids") or []:
            paths.append(f"debug/masks/{det_id}_masked.png")
        cover = paths[0] if paths else None
    return paths, cover


def publish_garments(
    job_id: str,
    result: dict[str, Any],
    workspace: dict[str, Any],
    seller_id: str,
    garment_ids: list[str] | None = None,
    price_overrides: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Turn reviewed garments into public marketplace listings.

    The listing snapshot uses the seller's edited attributes, their edited
    Swedish title/description, and the final price (a manual/approved price
    first, the AI recommendation only as a fallback the seller has seen)."""
    price_overrides = price_overrides or {}
    listings_ws = dict(workspace.get("listings") or {})
    pricing = workspace.get("pricing") or {}
    wanted = set(garment_ids) if garment_ids else None
    published: list[dict[str, Any]] = []

    for garment in result.get("garments") or []:
        gid = garment.get("id")
        if wanted is not None and gid not in wanted:
            continue
        listing_ws = dict(listings_ws.get(gid) or {})
        price_record = pricing.get(f"garment:{job_id}:{gid}") or {}
        price = price_overrides.get(gid)
        if price is None:
            price = price_record.get("finalPrice") or price_record.get("recommendedPrice") or 0
        images, cover = _garment_image_paths(garment)
        row = db.insert_listing(
            {
                "job_id": job_id,
                "garment_id": gid,
                "seller_id": seller_id,
                "title": listing_ws.get("title") or generate_title(garment),
                "description": listing_ws.get("description") or generate_description(garment),
                "category": garment.get("category"),
                "brand": garment.get("brand"),
                "size": garment.get("size"),
                "color": garment.get("color"),
                "condition": garment.get("condition"),
                "gender": garment.get("gender"),
                "defects": garment.get("defects"),
                "price": int(price),
                "images": [f"{job_id}/{path}" for path in images],
                "cover_image": f"{job_id}/{cover}" if cover else None,
                "status": "published",
            }
        )
        listing_ws.update({"status": "published", "listing_id": row["id"], "price": int(price)})
        listings_ws[gid] = listing_ws
        published.append(row)

    db.set_workspace(job_id, {**workspace, "listings": listings_ws})
    return published
