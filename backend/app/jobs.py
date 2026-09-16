from __future__ import annotations

import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ai_engine import pipeline as pipeline_mod
from ai_engine.pipeline import run_pipeline
from ai_engine.schemas import PipelineResult

from app import blobstore, db, workspace as workspace_mod

BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_ROOT = BACKEND_ROOT / "uploads"
OUTPUT_ROOT = BACKEND_ROOT / "job_outputs"

# 20-30 photos per batch is the product target; 40 is the hard cap so one
# oversized request can't tie up the single worker for an hour.
MAX_IMAGES_PER_JOB = 40

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
    # Provisional per-detection results while the batch is still running,
    # so the UI can show garments as they finish. In-memory only.
    partial: PipelineResult | None = field(default=None, repr=False)


_jobs: dict[str, Job] = {}
_warm_thread: threading.Thread | None = None


def warm_up_models_in_background() -> None:
    """Load the detector/SAM/CLIP/OCR weights right after boot so the first
    upload doesn't spend its first minute on cold model loading."""
    global _warm_thread
    if _warm_thread is not None:
        return
    _warm_thread = threading.Thread(target=pipeline_mod.warm_up, name="model-warmup", daemon=True)
    _warm_thread.start()


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
    if not db.postgres_enabled():
        if required:
            raise RuntimeError("Databasen är inte konfigurerad")
        return
    try:
        db.upsert_job(_job_payload(job), access_token=job.access_token)
    except Exception as exc:  # noqa: BLE001 — surface on create/final, log on progress
        print(f"[jobs] failed to persist {job.id}: {exc}")
        if required:
            raise RuntimeError(f"Kunde inte spara omgången i databasen: {exc}") from exc


def _job_from_row(row: dict) -> Job:
    result = None
    if row.get("result"):
        try:
            result = PipelineResult.model_validate(row["result"])
        except Exception as exc:  # noqa: BLE001
            print(f"[jobs] bad result jsonb for {row.get('id')}: {exc}")
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
    if not db.postgres_enabled():
        raise RuntimeError("Databasen är inte konfigurerad")
    if not db.storage_enabled():
        raise RuntimeError("Bildlagringen är inte konfigurerad")
    if not user_id:
        raise RuntimeError("Du behöver logga in för att ladda upp")
    job_id = uuid.uuid4().hex[:12]
    # Scratch under the backend tree only. Durable copy = Postgres + S3.
    scratch = UPLOAD_ROOT / job_id
    scratch.mkdir(parents=True, exist_ok=True)
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
        job.status = "error"
        job.error = f"Kunde inte spara bilderna: {exc}"
        _persist(job, required=False)
        _jobs.pop(job_id, None)
        shutil.rmtree(scratch, ignore_errors=True)
        raise RuntimeError(job.error) from exc

    thread = threading.Thread(target=_run_job, args=(job, input_dir), daemon=True)
    thread.start()
    return job


def get_job(job_id: str, access_token: str | None = None) -> Job | None:
    """Load job with Postgres as source of truth so interpretation results survive restarts."""
    row = None
    if db.postgres_enabled():
        try:
            row = db.fetch_job(job_id, access_token=access_token)
        except RuntimeError:
            row = None

    cached = _jobs.get(job_id)
    if row is not None:
        job = _job_from_row(row)
        if cached is not None and job.status in {"queued", "processing"}:
            if cached.current >= job.current:
                job.stage = cached.stage or job.stage
                job.current = cached.current
                job.total = cached.total or job.total
            if cached.result is not None and job.result is None:
                job.result = cached.result
                job.status = cached.status
                job.error = cached.error
            job.partial = cached.partial
        if cached is not None:
            job.access_token = cached.access_token
            job.scratch_dir = cached.scratch_dir
        _jobs[job_id] = job
        return job

    return cached


def list_jobs(user_id: str | None = None, is_admin: bool = False, access_token: str | None = None) -> list[Job]:
    if not is_admin and not user_id:
        return []

    if db.postgres_enabled():
        try:
            rows = db.list_jobs(user_id=None if is_admin else user_id, access_token=access_token)
            jobs: list[Job] = []
            for row in rows:
                try:
                    jobs.append(_job_from_row(row))
                except Exception as exc:  # noqa: BLE001
                    print(f"[jobs] skip bad row {row.get('id')}: {exc}")
            merged: dict[str, Job] = {job.id: job for job in jobs}
            for job in _jobs.values():
                if is_admin or job.user_id == user_id:
                    db_job = merged.get(job.id)
                    if db_job is not None:
                        # Prefer durable DB result/workspace; keep live progress from memory.
                        if db_job.result is not None:
                            job.result = db_job.result
                        job.workspace = db_job.workspace or job.workspace
                        if db_job.status in {"done", "error"}:
                            job.status = db_job.status
                            job.error = db_job.error
                    merged[job.id] = job
            return sorted(merged.values(), key=lambda item: item.created_at, reverse=True)
        except RuntimeError as exc:
            print(f"[jobs] failed to list jobs: {exc}")

    jobs = list(_jobs.values())
    if not is_admin:
        jobs = [job for job in jobs if job.user_id == user_id]
    return sorted(jobs, key=lambda item: item.created_at, reverse=True)


def _run_job(job: Job, input_dir: Path) -> None:
    job.status = "processing"
    _persist(job)
    # Scratch only — durable artifacts go to S3 + Postgres, then local outputs are deleted.
    output_dir = UPLOAD_ROOT / job.id / "out"
    output_dir.mkdir(parents=True, exist_ok=True)

    last_persist = 0.0

    def on_progress(stage: str, current: int, total: int) -> None:
        nonlocal last_persist
        job.stage = stage
        job.current = current
        job.total = total
        # Progress can tick many times a second with parallel workers; the
        # in-memory job is what the API reads, so only touch Postgres every
        # couple of seconds (and always on stage boundaries).
        now = time.time()
        if current in (0, total) or now - last_persist > 2.0:
            last_persist = now
            _persist(job)

    def on_partial(snapshot: PipelineResult) -> None:
        job.partial = snapshot

    try:
        job.result = run_pipeline(input_dir, output_dir, on_progress=on_progress, on_partial=on_partial)
        job.partial = None
        try:
            blobstore.upload_tree(job.id, output_dir, "artifact")
        except Exception as exc:  # noqa: BLE001
            print(f"[jobs] output upload failed {job.id}: {exc}")
            raise RuntimeError(f"Kunde inte spara resultatbilderna: {exc}") from exc
        job.status = "done"
        # Must land in Postgres — this is the seller's permanent interpretation record.
        _persist(job, required=True)
        job.workspace = workspace_mod.seed_workspace(job.id, job.result)
    except Exception as exc:  # noqa: BLE001 -- surface any failure to the client
        job.error = str(exc)
        job.status = "error"
        _persist(job, required=True)
    finally:
        if job.scratch_dir:
            shutil.rmtree(job.scratch_dir, ignore_errors=True)
            job.scratch_dir = None
