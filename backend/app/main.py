from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager
from typing import Annotated, Any
from urllib.parse import unquote

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app import blobstore, commerce, db, jobs, notifications, workspace as workspace_mod
from app import auth as auth_mod
from app.auth import require_user


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.startup()
    jobs.warm_up_models_in_background()
    yield


app = FastAPI(title="Miniplagg API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "https://miniplagg.com",
        "https://www.miniplagg.com",
        "https://admin.miniplagg.com",
        "https://appealing-embrace-production-8bc0.up.railway.app",
        "https://bountiful-prosperity-production-e9b2.up.railway.app",
    ],
    allow_origin_regex=r"https://([a-z0-9-]+\.)?(miniplagg\.com|up\.railway\.app|sslip\.io|nip\.io|trycloudflare\.com)",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


def _health() -> dict:
    database = db.ping()
    return {
        "status": "ok" if database.get("ok") else "degraded",
        "service": "kids-clothing-ai-listing-api",
        "database": database,
    }


@app.get("/")
async def health():
    return _health()


@app.get("/api/health")
async def api_health():
    return _health()


@app.get("/files/{job_id}/{file_path:path}")
async def serve_file(
    job_id: str,
    file_path: str,
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = None,
):
    # <img src> cannot send Authorization headers, so allow ?token= as well.
    auth_header = authorization
    if not auth_header and token:
        auth_header = f"Bearer {token}"
    storage_path = f"{job_id}/{file_path}"
    # Photos that belong to a published marketplace listing are public (the
    # marketplace is browsable without an account); everything else stays
    # private to the seller who uploaded it (and admins).
    if not db.is_public_image(storage_path):
        user = auth_mod.resolve_user(auth_header)
        if user is None:
            raise HTTPException(status_code=401, detail="Du behöver logga in")
        job = jobs.get_job(job_id, access_token=user.get("access_token"))
        if job is None or (user["role"] != "admin" and job.user_id != user["id"]):
            raise HTTPException(status_code=404, detail="Filen hittades inte")
    try:
        data, mime = blobstore.download_bytes(storage_path)
        return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=86400"})
    except Exception as exc:
        # While a batch is still processing its crops only exist in the local
        # scratch dir (they're uploaded to S3 when the run finishes) -- serve
        # them from there so the progressive results can show images.
        local = jobs.UPLOAD_ROOT / job_id / "out" / file_path
        if local.is_file() and local.resolve().is_relative_to((jobs.UPLOAD_ROOT / job_id).resolve()):
            mime = mimetypes.guess_type(str(local))[0] or "application/octet-stream"
            return Response(content=local.read_bytes(), media_type=mime)
        raise HTTPException(status_code=404, detail="Filen hittades inte") from exc


@app.get("/api/me")
async def me(user: Annotated[dict, Depends(require_user)]):
    return {key: value for key, value in user.items() if key != "access_token"}


@app.post("/api/auth/signup")
async def signup(body: dict[str, Any]):
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    full_name = (body.get("full_name") or "").strip() or None
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-post och lösenord krävs")
    try:
        return auth_mod.register_user(email, password, full_name=full_name, role="seller")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/auth/login")
async def login(body: dict[str, Any]):
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-post och lösenord krävs")
    try:
        return auth_mod.login_user(email, password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/jobs")
async def create_job(
    images: list[UploadFile] = File(...),
    user: dict = Depends(require_user),
):
    if not images:
        raise HTTPException(status_code=400, detail="Inga bilder laddades upp")
    if len(images) > jobs.MAX_IMAGES_PER_JOB:
        raise HTTPException(
            status_code=400,
            detail=f"Max {jobs.MAX_IMAGES_PER_JOB} bilder per uppladdning – dela upp i flera omgångar.",
        )
    files = [(image.filename or f"image_{i}.jpg", await image.read()) for i, image in enumerate(images)]
    try:
        job = jobs.create_job(files, user_id=user["id"], access_token=user.get("access_token"))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"job_id": job.id}


def _job_summary(job: jobs.Job) -> dict:
    return {
        "job_id": job.id,
        "status": job.status,
        "stage": job.stage,
        "current": job.current,
        "total": job.total,
        "error": job.error,
        "created_at": job.created_at,
        "image_count": job.image_count,
        "garment_count": len(job.result.garments) if job.result else None,
        "user_id": job.user_id,
    }


def _load_job(job_id: str, user: dict) -> jobs.Job:
    job = jobs.get_job(job_id, access_token=user.get("access_token"))
    if job is None:
        raise HTTPException(status_code=404, detail="Omgången hittades inte")
    if user["role"] != "admin" and job.user_id != user["id"]:
        raise HTTPException(status_code=404, detail="Omgången hittades inte")
    return job


def _job_payload(job: jobs.Job) -> dict:
    result = job.result.model_dump() if job.result else None
    workspace = job.workspace or db.get_workspace(job.id)
    payload = {
        **_job_summary(job),
        "result": workspace_mod.apply_to_result(result, workspace),
        "workspace": workspace,
    }
    if job.status == "processing" and job.partial is not None:
        payload["partial"] = job.partial.model_dump()
    return payload


@app.get("/api/jobs")
async def list_jobs(user: Annotated[dict, Depends(require_user)]):
    is_admin = user["role"] == "admin"
    return [_job_summary(job) for job in jobs.list_jobs(user_id=user["id"], is_admin=is_admin, access_token=user.get("access_token"))]


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, user: Annotated[dict, Depends(require_user)]):
    return _job_payload(_load_job(job_id, user))


@app.patch("/api/jobs/{job_id}/workspace")
async def patch_workspace(job_id: str, body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    job = _load_job(job_id, user)
    replace_keys = [key for key in ("groups",) if key in body]
    actor_patch = {key: value for key, value in body.items() if key in {"garment_edits", "match_decisions", "groups", "listings"}}
    if not actor_patch:
        raise HTTPException(status_code=400, detail="Inget att spara")
    workspace = db.merge_workspace(job.id, actor_patch, replace_keys=replace_keys)
    job.workspace = workspace
    return {"workspace": workspace, "result": _job_payload(job)["result"]}


@app.get("/api/jobs/{job_id}/pricing")
async def job_pricing(job_id: str, user: Annotated[dict, Depends(require_user)]):
    job = _load_job(job_id, user)
    workspace = workspace_mod.seed_workspace(job.id, job.result)
    job.workspace = workspace
    return list((workspace.get("pricing") or {}).values())


@app.get("/api/pricing")
async def list_pricing(user: Annotated[dict, Depends(require_user)]):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Endast admin")
    return workspace_mod.list_all_pricing()


@app.get("/api/pricing/{pricing_id}/history")
async def pricing_history(pricing_id: str, user: Annotated[dict, Depends(require_user)]):
    pricing_id = unquote(pricing_id)
    job_id = _job_id_from_pricing(pricing_id)
    job = _load_job(job_id, user)
    history = (job.workspace or {}).get("pricing_history") or {}
    return history.get(pricing_id) or []


@app.post("/api/pricing/{pricing_id}/approve")
async def approve_pricing(pricing_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    return _pricing_action(pricing_id, "approve", user, body or {})


@app.post("/api/pricing/{pricing_id}/reject")
async def reject_pricing(pricing_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Endast admin")
    return _pricing_action(pricing_id, "reject", user, body or {})


@app.patch("/api/pricing/{pricing_id}")
async def update_pricing(pricing_id: str, body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    return _pricing_action(pricing_id, "update", user, body)


# ---------------------------------------------------------------------------
# Publishing + public marketplace
# ---------------------------------------------------------------------------


@app.post("/api/jobs/{job_id}/publish")
async def publish_job(job_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    job = _load_job(job_id, user)
    if not job.result:
        raise HTTPException(status_code=400, detail="Bearbetningen är inte klar än")
    body = body or {}
    garment_ids = body.get("garment_ids")
    overrides = {str(k): int(v) for k, v in (body.get("prices") or {}).items() if v is not None}
    payload = _job_payload(job)
    workspace = payload["workspace"] or workspace_mod.seed_workspace(job.id, job.result)
    seller_id = job.user_id or user["id"]
    try:
        listings = workspace_mod.publish_garments(
            job.id, payload["result"], workspace, seller_id, garment_ids=garment_ids, price_overrides=overrides
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    job.workspace = db.get_workspace(job.id)
    return {"listings": listings, "workspace": job.workspace}


def _public_listing(listing: dict[str, Any], user: dict | None = None) -> dict[str, Any]:
    data = dict(listing)
    data["seller_name"] = (listing.get("seller_name") or "Säljare").split(" ")[0]
    if user is not None:
        data["is_mine"] = listing.get("seller_id") == user["id"]
    return data


def _optional_user(authorization: Annotated[str | None, Header()] = None) -> dict | None:
    if not authorization:
        return None
    try:
        return auth_mod.resolve_user(authorization)
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/marketplace/listings")
async def marketplace_listings(
    q: str | None = None,
    category: str | None = None,
    size: str | None = None,
    condition: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    sort: str = "newest",
    limit: int = 60,
    offset: int = 0,
    user: dict | None = Depends(_optional_user),
):
    if not db.postgres_enabled():
        raise HTTPException(status_code=503, detail="Databasen är inte konfigurerad")
    rows = db.list_public_listings(
        query=q,
        category=category,
        size=size,
        condition=condition,
        min_price=min_price,
        max_price=max_price,
        sort=sort,
        limit=max(1, min(int(limit), 120)),
        offset=max(0, int(offset)),
    )
    favorites = set(db.list_favorite_ids(user["id"])) if user else set()
    items = []
    for row in rows:
        item = _public_listing(row, user)
        item["is_favorite"] = row["id"] in favorites
        items.append(item)
    return {"items": items, "facets": db.listing_facets()}


@app.get("/api/marketplace/listings/{listing_id}")
async def marketplace_listing(listing_id: str, user: dict | None = Depends(_optional_user)):
    listing = db.fetch_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    is_owner = bool(user) and listing.get("seller_id") == user["id"]
    if listing.get("status") == "unpublished" and not is_owner and not (user and user.get("role") == "admin"):
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    item = _public_listing(listing, user)
    item["is_favorite"] = bool(user) and listing["id"] in set(db.list_favorite_ids(user["id"]))
    item["reserved_for_me"] = False
    item["in_cart"] = False
    if user:
        offer = db.accepted_offer_for(listing["id"], user["id"])
        item["reserved_for_me"] = listing.get("status") == "reserved" and offer is not None
        item["accepted_offer"] = offer
        item["in_cart"] = any(entry["id"] == listing["id"] for entry in db.list_cart(user["id"]))
    return item


@app.patch("/api/marketplace/listings/{listing_id}")
async def update_listing(listing_id: str, body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    listing = db.fetch_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    if listing.get("seller_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Du kan bara ändra dina egna annonser")
    if body.get("status") not in (None, "published", "sold", "unpublished"):
        raise HTTPException(status_code=400, detail="Ogiltig status")
    patch = dict(body)
    if "images" in patch:
        # Seller/admin removing unwanted photos: only existing paths, never empty.
        wanted = [path for path in (patch.get("images") or []) if path in (listing.get("images") or [])]
        if not wanted:
            raise HTTPException(status_code=400, detail="En annons måste ha minst en bild.")
        patch["images"] = wanted
        if listing.get("cover_image") not in wanted:
            patch["cover_image"] = wanted[0]
    return _public_listing(db.update_listing(listing_id, patch) or listing, user)


@app.delete("/api/jobs/{job_id}/garments/{garment_id}/images/{detection_id}")
async def delete_garment_image(job_id: str, garment_id: str, detection_id: str, user: Annotated[dict, Depends(require_user)]):
    job = _load_job(job_id, user)
    payload = _job_payload(job)
    garment = next((g for g in (payload["result"] or {}).get("garments", []) if g.get("id") == garment_id), None)
    if not garment:
        raise HTTPException(status_code=404, detail="Plagget hittades inte")
    try:
        job.workspace = workspace_mod.remove_garment_image(job.id, garment_id, detection_id, garment.get("detection_ids") or [])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _job_payload(job)


@app.post("/api/marketplace/listings/{listing_id}/favorite")
async def add_favorite(listing_id: str, user: Annotated[dict, Depends(require_user)]):
    if not db.fetch_listing(listing_id):
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    db.add_favorite(user["id"], listing_id)
    return {"ok": True, "is_favorite": True}


@app.delete("/api/marketplace/listings/{listing_id}/favorite")
async def remove_favorite(listing_id: str, user: Annotated[dict, Depends(require_user)]):
    db.remove_favorite(user["id"], listing_id)
    return {"ok": True, "is_favorite": False}


def _first_name(value: str | None, fallback: str) -> str:
    return (value or fallback).split(" ")[0]


@app.post("/api/marketplace/listings/{listing_id}/offers")
async def create_offer(listing_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    listing = db.fetch_listing(listing_id)
    if not listing or listing.get("status") != "published":
        raise HTTPException(status_code=404, detail="Annonsen är inte tillgänglig")
    if listing.get("seller_id") == user["id"]:
        raise HTTPException(status_code=400, detail="Du kan inte lägga bud på din egen annons")
    body = body or {}
    kind = "buy" if body.get("kind") == "buy" else "offer"
    amount = int(body.get("amount") or (listing.get("price") if kind == "buy" else 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Ange ett giltigt belopp")
    message = (body.get("message") or "").strip() or None
    offer = db.create_offer(listing_id, user["id"], listing.get("seller_id"), kind, amount, message)
    buyer = _first_name(user.get("full_name"), "En köpare")
    notifications.notify(
        listing.get("seller_id"),
        "offer",
        f"Nytt bud på ”{listing['title']}”",
        f"{buyer} bjuder {amount} kr" + (f": ”{message}”" if message else "."),
        link="/annonser?flik=bud",
        data={"offer_id": offer["id"], "listing_id": listing_id},
    )
    return offer


@app.get("/api/me/offers")
async def my_offers(user: Annotated[dict, Depends(require_user)]):
    return db.list_offers(user["id"])


def _accept_offer(offer: dict[str, Any], amount: int) -> dict[str, Any]:
    """Accepting (either side) reserves the listing for the buyer and drops it
    in their cart at the agreed price, so the deal goes straight to checkout."""
    updated = db.update_offer(offer["id"], status="accepted", amount=int(amount))
    db.update_listing(offer["listing_id"], {"status": "reserved"})
    db.add_cart_item(offer["buyer_id"], offer["listing_id"], int(amount), offer["id"])
    return updated or offer


@app.post("/api/offers/{offer_id}/counter")
async def counter_offer(offer_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    offer = db.fetch_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Budet hittades inte")
    if offer.get("seller_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bara säljaren kan lägga motbud")
    if offer.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Budet kan inte längre besvaras")
    body = body or {}
    amount = int(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Ange ett giltigt motbud")
    message = (body.get("message") or "").strip() or None
    updated = db.update_offer(offer_id, status="countered", counter_amount=amount, counter_message=message)
    notifications.notify(
        offer.get("buyer_id"),
        "counteroffer",
        f"Motbud på ”{offer.get('listing_title')}”",
        f"Säljaren föreslår {amount} kr i stället för {offer.get('amount')} kr." + (f" ”{message}”" if message else ""),
        link="/annonser?flik=bud",
        data={"offer_id": offer_id, "listing_id": offer.get("listing_id")},
    )
    return updated


@app.post("/api/offers/{offer_id}/{action}")
async def respond_offer(offer_id: str, action: str, user: Annotated[dict, Depends(require_user)]):
    offer = db.fetch_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Budet hittades inte")
    if action not in ("accept", "decline", "cancel"):
        raise HTTPException(status_code=400, detail="Ogiltig åtgärd")
    is_buyer = offer.get("buyer_id") == user["id"]
    is_seller = offer.get("seller_id") == user["id"] or user.get("role") == "admin"
    status = offer.get("status")
    title = offer.get("listing_title") or "annonsen"

    if action == "cancel":
        if not is_buyer:
            raise HTTPException(status_code=403, detail="Bara köparen kan dra tillbaka budet")
        if status not in ("pending", "countered"):
            raise HTTPException(status_code=400, detail="Budet kan inte dras tillbaka")
        return db.update_offer_status(offer_id, "cancelled")

    if status == "countered":
        # The buyer answers the seller's counter-offer.
        if not is_buyer:
            raise HTTPException(status_code=403, detail="Bara köparen kan svara på motbudet")
        if action == "accept":
            updated = _accept_offer(offer, int(offer.get("counter_amount") or offer.get("amount") or 0))
            notifications.notify(
                offer.get("seller_id"),
                "offer_accepted",
                f"Motbudet på ”{title}” accepterades",
                f"{_first_name(user.get('full_name'), 'Köparen')} accepterade {updated.get('amount')} kr och kan nu betala i kassan.",
                link="/annonser?flik=bud",
                data={"offer_id": offer_id},
            )
            return updated
        updated = db.update_offer_status(offer_id, "declined")
        notifications.notify(
            offer.get("seller_id"),
            "offer_declined",
            f"Motbudet på ”{title}” avböjdes",
            f"{_first_name(user.get('full_name'), 'Köparen')} tackade nej till {offer.get('counter_amount')} kr.",
            link="/annonser?flik=bud",
            data={"offer_id": offer_id},
        )
        return updated

    if status != "pending":
        raise HTTPException(status_code=400, detail="Budet kan inte längre besvaras")
    if not is_seller:
        raise HTTPException(status_code=403, detail="Bara säljaren kan svara på budet")
    if action == "accept":
        updated = _accept_offer(offer, int(offer.get("amount") or 0))
        notifications.notify(
            offer.get("buyer_id"),
            "offer_accepted",
            f"Ditt bud på ”{title}” accepterades!",
            f"Säljaren accepterade {updated.get('amount')} kr. Plagget är reserverat åt dig – gå till kassan för att betala.",
            link="/kassa",
            data={"offer_id": offer_id, "listing_id": offer.get("listing_id")},
        )
        return updated
    updated = db.update_offer_status(offer_id, "declined")
    notifications.notify(
        offer.get("buyer_id"),
        "offer_declined",
        f"Ditt bud på ”{title}” avböjdes",
        f"Säljaren tackade nej till {offer.get('amount')} kr.",
        link=f"/marknad/{offer.get('listing_id')}",
        data={"offer_id": offer_id, "listing_id": offer.get("listing_id")},
    )
    return updated


# ---------------------------------------------------------------------------
# Notifications + Web Push
# ---------------------------------------------------------------------------


@app.get("/api/notifications")
async def list_notifications(limit: int = 50, user: dict = Depends(require_user)):
    return {
        "items": db.list_notifications(user["id"], limit=max(1, min(int(limit), 200))),
        "unread": db.unread_notification_count(user["id"]),
        "unread_messages": db.unread_message_count(user["id"]),
        "cart_count": db.cart_count(user["id"]),
    }


@app.post("/api/notifications/read")
async def read_notifications(body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    ids = [str(i) for i in ((body or {}).get("ids") or [])] or None
    db.mark_notifications_read(user["id"], ids)
    return {"unread": db.unread_notification_count(user["id"])}


@app.get("/api/push/public-key")
async def push_public_key():
    key = notifications.public_key()
    return {"public_key": key, "enabled": bool(key)}


@app.post("/api/push/subscribe")
async def push_subscribe(body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    sub = body.get("subscription") or body
    keys = sub.get("keys") or {}
    if not sub.get("endpoint") or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Ogiltig push-prenumeration")
    db.upsert_push_subscription(user["id"], sub["endpoint"], keys["p256dh"], keys["auth"])
    return {"ok": True}


@app.delete("/api/push/subscribe")
async def push_unsubscribe(body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    if body.get("endpoint"):
        db.delete_push_subscription(body["endpoint"], user["id"])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Messages about a listing
# ---------------------------------------------------------------------------


@app.post("/api/marketplace/listings/{listing_id}/messages")
async def send_message(listing_id: str, body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    listing = db.fetch_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Skriv ett meddelande")
    if listing.get("seller_id") == user["id"]:
        recipient_id = str(body.get("recipient_id") or "")
        if not recipient_id:
            raise HTTPException(status_code=400, detail="Ange vem du svarar")
    else:
        recipient_id = listing.get("seller_id")
    if not recipient_id or recipient_id == user["id"]:
        raise HTTPException(status_code=400, detail="Ogiltig mottagare")
    message = db.insert_message(listing_id, user["id"], recipient_id, text[:2000])
    sender = _first_name(user.get("full_name"), "Någon")
    notifications.notify(
        recipient_id,
        "message",
        f"{sender} skrev om ”{listing['title']}”",
        text[:140],
        link=f"/meddelanden?annons={listing_id}&med={user['id']}",
        data={"listing_id": listing_id, "from": user["id"]},
    )
    return message


@app.get("/api/messages")
async def my_threads(user: Annotated[dict, Depends(require_user)]):
    return {"threads": db.list_threads(user["id"]), "unread": db.unread_message_count(user["id"])}


@app.get("/api/messages/{listing_id}/{other_id}")
async def conversation(listing_id: str, other_id: str, user: Annotated[dict, Depends(require_user)]):
    listing = db.fetch_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    db.mark_messages_read(user["id"], listing_id, other_id)
    other = db.fetch_profile(other_id)
    return {
        "listing": _public_listing(listing, user),
        "other": {"id": other_id, "name": (other or {}).get("full_name") or "Användare"},
        "messages": db.list_conversation(user["id"], listing_id, other_id),
    }


# ---------------------------------------------------------------------------
# Cart, checkout, orders
# ---------------------------------------------------------------------------


def _cart_payload(user_id: str) -> dict[str, Any]:
    items = db.list_cart(user_id)
    payload_items = []
    for item in items:
        available = commerce.listing_available_for(user_id, item)
        payload_items.append({**_public_listing(item), "available": available})
    total = sum(int(i["cart_price"]) for i in payload_items if i["available"])
    return {"items": payload_items, "total": total, "count": len(payload_items), "stripe_enabled": commerce.stripe_enabled()}


@app.get("/api/cart")
async def get_cart(user: Annotated[dict, Depends(require_user)]):
    return _cart_payload(user["id"])


@app.post("/api/cart")
async def add_to_cart(body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    listing_id = str(body.get("listing_id") or "")
    listing = db.fetch_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Annonsen hittades inte")
    if listing.get("seller_id") == user["id"]:
        raise HTTPException(status_code=400, detail="Du kan inte köpa din egen annons")
    if not commerce.listing_available_for(user["id"], listing):
        raise HTTPException(status_code=400, detail="Plagget är inte tillgängligt just nu")
    price, offer_id = commerce.cart_price_for(user["id"], listing)
    db.add_cart_item(user["id"], listing_id, price, offer_id)
    return _cart_payload(user["id"])


@app.delete("/api/cart/{listing_id}")
async def remove_from_cart(listing_id: str, user: Annotated[dict, Depends(require_user)]):
    db.remove_cart_item(user["id"], listing_id)
    return _cart_payload(user["id"])


@app.post("/api/checkout")
async def checkout(body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    try:
        return commerce.start_checkout(user, body.get("shipping") or {}, body.get("payment_method") or "test")
    except commerce.CheckoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- e.g. Stripe API failure
        raise HTTPException(status_code=502, detail=f"Betalningen kunde inte startas: {exc}") from exc


def _load_order(order_id: str, user: dict) -> dict[str, Any]:
    order = db.fetch_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordern hittades inte")
    is_buyer = order.get("buyer_id") == user["id"]
    is_seller = any(item.get("seller_id") == user["id"] for item in order["items"])
    if not (is_buyer or is_seller or user.get("role") == "admin"):
        raise HTTPException(status_code=404, detail="Ordern hittades inte")
    if is_seller and not is_buyer and user.get("role") != "admin":
        order["items"] = [item for item in order["items"] if item.get("seller_id") == user["id"]]
    return order


@app.get("/api/orders")
async def list_orders(user: Annotated[dict, Depends(require_user)]):
    return db.list_orders(user["id"])


@app.get("/api/orders/{order_id}")
async def get_order(order_id: str, user: Annotated[dict, Depends(require_user)]):
    return _load_order(order_id, user)


@app.post("/api/orders/{order_id}/pay")
async def pay_order_test(order_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    """Built-in test payment (used when Stripe is not configured)."""
    order = _load_order(order_id, user)
    if order.get("buyer_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Bara köparen kan betala ordern")
    if order.get("payment_provider") == "stripe" and commerce.stripe_enabled():
        raise HTTPException(status_code=400, detail="Den här ordern betalas via Stripe")
    card = str((body or {}).get("card_number") or "").replace(" ", "")
    if card and (len(card) < 12 or not card.isdigit()):
        raise HTTPException(status_code=400, detail="Ogiltigt kortnummer")
    try:
        return commerce.complete_order(order_id, payment_ref=f"test-{order_id[:8]}")
    except commerce.CheckoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/orders/{order_id}/confirm")
async def confirm_order(order_id: str, body: dict[str, Any] | None = None, user: dict = Depends(require_user)):
    order = _load_order(order_id, user)
    if order.get("status") == "paid":
        return order
    try:
        return commerce.confirm_stripe(order, (body or {}).get("session_id"))
    except commerce.CheckoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Kunde inte bekräfta betalningen: {exc}") from exc


@app.post("/api/orders/{order_id}/items/{item_id}/ship")
async def ship_order_item(order_id: str, item_id: str, user: Annotated[dict, Depends(require_user)]):
    order = _load_order(order_id, user)
    item = next((i for i in order["items"] if i["id"] == item_id), None)
    if not item or (item.get("seller_id") != user["id"] and user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Bara säljaren kan markera som skickad")
    updated = db.update_order_item(item_id, "shipped")
    notifications.notify(
        order.get("buyer_id"),
        "order_shipped",
        f"”{item['title']}” är skickad",
        "Säljaren har skickat ditt plagg.",
        link=f"/kassa/klart/{order_id}",
        data={"order_id": order_id},
    )
    return updated


@app.get("/api/me/favorites")
async def my_favorites(user: Annotated[dict, Depends(require_user)]):
    return [_public_listing(row, user) | {"is_favorite": True} for row in db.list_favorites(user["id"])]


@app.get("/api/me/listings")
async def my_listings(user: Annotated[dict, Depends(require_user)]):
    rows = db.list_all_listings() if user.get("role") == "admin" else db.list_seller_listings(user["id"])
    return [_public_listing(row, user) for row in rows]


def _job_id_from_pricing(pricing_id: str) -> str:
    parts = unquote(pricing_id).split(":")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="Ogiltigt pris-id")
    return parts[1]


def _pricing_action(pricing_id: str, action: str, user: dict, body: dict[str, Any]) -> dict:
    pricing_id = unquote(pricing_id)
    job_id = _job_id_from_pricing(pricing_id)
    _load_job(job_id, user)
    actor = user.get("full_name") or user.get("email") or user["role"]
    try:
        return workspace_mod.mutate_pricing(job_id, pricing_id, action, actor, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Prisposten hittades inte") from None
