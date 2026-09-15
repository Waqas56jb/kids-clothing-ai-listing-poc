from __future__ import annotations

import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ai_engine.pipeline import run_pipeline
from ai_engine.schemas import PipelineResult

from app import blobstore, db, workspace as workspace_mod

BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
OUTPUT_ROOT = BACKEND_ROOT / "job_outputs"

JobStatus = Literal["queued", "processing", "done", "error"]


@dataclass
class Job:
    id: str
    status: JobStatus = "queued"
    stage: str | None = None
    current: int = 0
    total: int = 0
    result: PipelineResult | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    image_count: int = 0
    user_id: str | None = None
    access_token: str | None = field(default=None, repr=False)
    workspace: dict = field(default_factory=dict)
    scratch_dir: str | None = field(default=None, repr=False)


_jobs: dict[str, Job] = {}


def _job_payload(job: Job) -> dict:
    return {
        "id": job.id,
        "user_id": job.user_id,
        "status": job.status,
        "stage": job.stage,
        "current": job.current,
        "total": job.total,
        "error": job.error,
        "image_count": job.image_count,
        "garment_count": len(job.result.garments) if job.result else None,
        "result": job.result.model_dump(mode="json") if job.result else None,
        "created_at": db.to_iso(job.created_at),
    }


def _persist(job: Job, required: bool = False) -> None:
    if not db.storage_enabled():
        if required:
            raise RuntimeError("Database is not configured")
        return
    try:
        db.upsert_job(_job_payload(job), access_token=job.access_token)
    except Exception as exc:  # noqa: BLE001 — surface on create, log on progress
        print(f"[jobs] failed to persist {job.id}: {exc}")
        if required:
            raise RuntimeError(f"Could not save job to the database: {exc}") from exc


def _job_from_row(row: dict) -> Job:
    result = None
    if row.get("result"):
        result = PipelineResult.model_validate(row["result"])
    user_id = row.get("user_id")
    workspace = dict(row.get("workspace") or {})
    return Job(
        id=str(row["id"]),
        status=row.get("status") or "queued",
        stage=row.get("stage"),
        current=int(row.get("current") or 0),
        total=int(row.get("total") or 0),
        result=result,
        error=row.get("error"),
        created_at=db.from_iso(row.get("created_at"), time.time()),
        image_count=int(row.get("image_count") or 0),
        user_id=str(user_id) if user_id else None,
        workspace=workspace,
    )


def create_job(files: list[tuple[str, bytes]], user_id: str | None = None, access_token: str | None = None) -> Job:
    job_id = uuid.uuid4().hex[:12]
    scratch = Path(tempfile.mkdtemp(prefix=f"kidsai-{job_id}-"))
    job = Job(id=job_id, image_count=len(files), user_id=user_id, access_token=access_token, scratch_dir=str(scratch))
    _jobs[job_id] = job
    try:
        _persist(job, required=True)
    except Exception:
        _jobs.pop(job_id, None)
        shutil.rmtree(scratch, ignore_errors=True)
        raise

    input_dir = scratch / "in"
    input_dir.mkdir(parents=True, exist_ok=True)
    for index, (filename, content) in enumerate(files):
        safe_name = Path(filename or f"image_{index}.jpg").name
        (input_dir / f"{index:02d}_{safe_name}").write_bytes(content)

    try:
        blobstore.upload_originals(job_id, input_dir)
    except Exception as exc:  # noqa: BLE001
        print(f"[jobs] original upload failed {job_id}: {exc}")
        _jobs.pop(job_id, None)
        shutil.rmtree(scratch, ignore_errors=True)
        raise RuntimeError(f"Could not save images to storage: {exc}") from exc

    thread = threading.Thread(target=_run_job, args=(job, input_dir), daemon=True)
    thread.start()
    return job


def get_job(job_id: str, access_token: str | None = None) -> Job | None:
    cached = _jobs.get(job_id)
    if cached is not None:
        if db.storage_enabled():
            try:
                cached.workspace = db.get_workspace(job_id)
            except Exception:
                pass
        return cached
    if not db.storage_enabled():
        return None
    try:
        row = db.fetch_job(job_id, access_token=access_token)
    except RuntimeError:
        return None
    if row is None:
        return None
    job = _job_from_row(row)
    _jobs[job_id] = job
    return job


def list_jobs(user_id: str | None = None, is_admin: bool = False, access_token: str | None = None) -> list[Job]:
    if db.storage_enabled():
        try:
            rows = db.list_jobs(user_id=None if is_admin else user_id, access_token=access_token)
            jobs = [_job_from_row(row) for row in rows]
            merged: dict[str, Job] = {job.id: job for job in jobs}
            for job in _jobs.values():
                if is_admin or job.user_id == user_id:
                    db_job = merged.get(job.id)
                    if db_job is not None:
                        job.workspace = db_job.workspace
                    merged[job.id] = job
            return sorted(merged.values(), key=lambda job: job.created_at, reverse=True)
        except RuntimeError as exc:
            print(f"[jobs] failed to list jobs: {exc}")

    jobs = list(_jobs.values())
    if not is_admin:
        jobs = [job for job in jobs if job.user_id == user_id]
    return sorted(jobs, key=lambda job: job.created_at, reverse=True)


def _cleanup_scratch(job: Job) -> None:
    if job.scratch_dir:
        shutil.rmtree(job.scratch_dir, ignore_errors=True)
        job.scratch_dir = None


def _run_job(job: Job, input_dir: Path) -> None:
    job.status = "processing"
    _persist(job)
    scratch = Path(job.scratch_dir) if job.scratch_dir else input_dir.parent
    output_dir = scratch / "out"

    def on_progress(stage: str, current: int, total: int) -> None:
        job.stage = stage
        job.current = current
        job.total = total
        _persist(job)

    try:
        job.result = run_pipeline(input_dir, output_dir, on_progress=on_progress)
        blobstore.upload_tree(job.id, output_dir, "artifact")
        job.status = "done"
        _persist(job)
        job.workspace = workspace_mod.seed_workspace(job.id, job.result)
    except Exception as exc:  # noqa: BLE001 -- surface any failure to the client
        job.error = str(exc)
        job.status = "error"
        _persist(job)
    finally:
        _cleanup_scratch(job)
