from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db, jobs
from app.auth import require_user


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.startup()
    yield


app = FastAPI(title="Kids Clothing AI Listing API", lifespan=lifespan)

# Browser apps on Railway + local Vite. Authorization is a custom header so
# preflight must succeed from those origins.
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

jobs.OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
# Serves debug crops/masks so the client can render them directly, e.g.
# /files/{job_id}/debug/masks/{detection_id}_masked.png
app.mount("/files", StaticFiles(directory=str(jobs.OUTPUT_ROOT)), name="files")


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


@app.get("/api/jobs")
async def list_jobs(user: Annotated[dict, Depends(require_user)]):
    is_admin = user["role"] == "admin"
    return [_job_summary(job) for job in jobs.list_jobs(user_id=user["id"], is_admin=is_admin, access_token=user.get("access_token"))]


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, user: Annotated[dict, Depends(require_user)]):
    job = jobs.get_job(job_id, access_token=user.get("access_token"))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if user["role"] != "admin" and job.user_id != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        **_job_summary(job),
        "result": job.result.model_dump() if job.result else None,
    }
