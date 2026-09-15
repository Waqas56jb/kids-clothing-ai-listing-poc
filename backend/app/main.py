from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager
from typing import Annotated, Any
from urllib.parse import unquote

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app import blobstore, db, jobs, workspace as workspace_mod
from app.auth import require_user


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.startup()
    yield


app = FastAPI(title="Kids Clothing AI Listing API", lifespan=lifespan)

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
        "https://appealing-embrace-production-8bc0.up.railway.app",
        "https://bountiful-prosperity-production-e9b2.up.railway.app",
    ],
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_methods=["*"],
    allow_headers=["*"],
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
async def serve_file(job_id: str, file_path: str):
    storage_path = f"{job_id}/{file_path}"
    try:
        data, mime = blobstore.download_bytes(storage_path)
        return Response(content=data, media_type=mime)
    except RuntimeError:
        local = jobs.OUTPUT_ROOT / job_id / file_path
        if local.is_file():
            mime = mimetypes.guess_type(str(local))[0] or "application/octet-stream"
            return Response(content=local.read_bytes(), media_type=mime)
        raise HTTPException(status_code=404, detail="File not found") from None


@app.get("/api/me")
async def me(user: Annotated[dict, Depends(require_user)]):
    return {key: value for key, value in user.items() if key != "access_token"}


@app.post("/api/jobs")
async def create_job(
    images: list[UploadFile] = File(...),
    user: dict = Depends(require_user),
):
    if not images:
        raise HTTPException(status_code=400, detail="No images uploaded")
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
        raise HTTPException(status_code=404, detail="Job not found")
    if user["role"] != "admin" and job.user_id != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _job_payload(job: jobs.Job) -> dict:
    result = job.result.model_dump() if job.result else None
    workspace = job.workspace or db.get_workspace(job.id)
    return {
        **_job_summary(job),
        "result": workspace_mod.apply_to_result(result, workspace),
        "workspace": workspace,
    }


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
        raise HTTPException(status_code=400, detail="Nothing to save")
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
        raise HTTPException(status_code=403, detail="Admin only")
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
        raise HTTPException(status_code=403, detail="Admin only")
    return _pricing_action(pricing_id, "reject", user, body or {})


@app.patch("/api/pricing/{pricing_id}")
async def update_pricing(pricing_id: str, body: dict[str, Any], user: Annotated[dict, Depends(require_user)]):
    return _pricing_action(pricing_id, "update", user, body)


def _job_id_from_pricing(pricing_id: str) -> str:
    parts = unquote(pricing_id).split(":")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="Invalid pricing id")
    return parts[1]


def _pricing_action(pricing_id: str, action: str, user: dict, body: dict[str, Any]) -> dict:
    pricing_id = unquote(pricing_id)
    job_id = _job_id_from_pricing(pricing_id)
    _load_job(job_id, user)
    actor = user.get("full_name") or user.get("email") or user["role"]
    try:
        return workspace_mod.mutate_pricing(job_id, pricing_id, action, actor, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="Pricing record not found") from None
