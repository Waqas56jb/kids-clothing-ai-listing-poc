from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ai_engine.schemas import PipelineResult

from app import db

EDITABLE_FIELDS = ("category", "brand", "size", "color", "condition", "gender", "defects")

CATEGORY_BASE = {
    "bodysuit": (30, 50),
    "onesie": (30, 50),
    "romper": (35, 60),
    "sleeper": (35, 60),
    "dress": (50, 90),
    "jacket": (80, 150),
    "coat": (90, 160),
    "sweater": (50, 90),
    "cardigan": (45, 80),
    "shirt": (30, 60),
    "blouse": (30, 60),
    "t-shirt": (25, 45),
    "top": (25, 45),
    "trousers": (30, 55),
    "pants": (30, 55),
    "shorts": (25, 45),
    "skirt": (30, 55),
    "hat": (15, 30),
    "beanie": (15, 30),
    "vest": (40, 70),
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
        key = f"{garment.get('size') or 'unspecified size'}|{garment.get('category')}"
        if key not in by_key:
            by_key[key] = {
                "id": key,
                "size": garment.get("size") or "Unspecified size",
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
    def title(text: str) -> str:
        return str(text).replace("_", " ").title()

    parts = [garment.get("brand"), garment.get("color"), title(garment.get("category") or "item")]
    parts = [part for part in parts if part]
    return " ".join(parts) if parts else f"Kids {title(garment.get('category') or 'item')}"


def generate_description(garment: dict[str, Any]) -> str:
    lines = []
    if garment.get("brand"):
        lines.append(f"Brand: {garment['brand']}")
    if garment.get("size"):
        lines.append(f"Size: {garment['size']}")
    if garment.get("color"):
        lines.append(f"Color: {garment['color']}")
    condition = "please verify — AI flagged possible wear" if garment.get("defects") else (garment.get("condition") or "good")
    lines.append(f"Condition: {condition}")
    if garment.get("gender"):
        lines.append(f"Gender: {garment['gender']}")
    return f"{generate_title(garment)}, in {condition} pre-loved condition.\n\n" + "\n".join(lines)


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
        "reason": "Estimated from category, brand presence, and condition.",
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
        "reason": "Estimated bundle price from category, size, and item count.",
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
    for garment in result.get("garments") or []:
        extra = edits.get(garment.get("id")) or {}
        for field in EDITABLE_FIELDS:
            if field in extra and extra[field] is not None:
                garment[field] = extra[field]
        if garment.get("id") in decisions:
            garment["match_decision"] = decisions[garment["id"]]
    return result


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
        reason = "Approved AI recommendation"
    elif action == "reject":
        record["status"] = "rejected"
        record["finalPrice"] = None
        reason = payload.get("note") or "Rejected AI recommendation"
    else:
        if payload.get("minPrice") is not None:
            record["minPrice"] = payload["minPrice"]
        if payload.get("maxPrice") is not None:
            record["maxPrice"] = payload["maxPrice"]
        if payload.get("finalPrice") is not None:
            record["finalPrice"] = payload["finalPrice"]
        record["status"] = "manually_adjusted"
        reason = payload.get("note") or "Manual price adjustment"
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
