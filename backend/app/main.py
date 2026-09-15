from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import jobs
from app.auth import require_user

app = FastAPI(title="Kids Clothing AI Listing API")

# Local dev only: the Vite dev server and this API run on different ports.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs.OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
# Serves debug crops/masks so the client can render them directly, e.g.
# /files/{job_id}/debug/masks/{detection_id}_masked.png
app.mount("/files", StaticFiles(directory=str(jobs.OUTPUT_ROOT)), name="files")


@app.get("/")
async def health():
    # Deliberately does not touch ai_engine's models -- those load lazily on
    # first job, so a healthy response here just confirms the API process
    # itself booted, independent of whether/when a job has run yet.
    return {"status": "ok", "service": "kids-clothing-ai-listing-api"}


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
    job = jobs.create_job(files, user_id=user["id"], access_token=user.get("access_token"))
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
