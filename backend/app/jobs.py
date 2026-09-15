from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ai_engine.pipeline import run_pipeline
from ai_engine.schemas import PipelineResult

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


_jobs: dict[str, Job] = {}


def create_job(files: list[tuple[str, bytes]]) -> Job:
    """Save the uploaded images and kick off background processing.

    Runs on a plain `threading.Thread` rather than FastAPI's
    `BackgroundTasks` -- the pipeline is CPU-bound and can take several
    minutes per photo (SAM2 + a vision LLM call per detection), and a real
    OS thread keeps that from blocking the server's event loop while other
    requests (like progress polling) are being served.
    """
    job_id = uuid.uuid4().hex[:12]
    job = Job(id=job_id, image_count=len(files))
    _jobs[job_id] = job

    input_dir = UPLOAD_ROOT / job_id
    input_dir.mkdir(parents=True, exist_ok=True)
    for index, (filename, content) in enumerate(files):
        safe_name = Path(filename or f"image_{index}.jpg").name
        (input_dir / f"{index:02d}_{safe_name}").write_bytes(content)

    thread = threading.Thread(target=_run_job, args=(job, input_dir), daemon=True)
    thread.start()
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def list_jobs() -> list[Job]:
    """All known jobs, newest first.

    In-memory only, per the POC scope -- this resets on every server
    restart, same as the jobs themselves. Good enough for an admin view
    into "what's running / recently ran" without standing up a database.
    """
    return sorted(_jobs.values(), key=lambda job: job.created_at, reverse=True)


def _run_job(job: Job, input_dir: Path) -> None:
    job.status = "processing"
    output_dir = OUTPUT_ROOT / job.id

    def on_progress(stage: str, current: int, total: int) -> None:
        job.stage = stage
        job.current = current
        job.total = total

    try:
        job.result = run_pipeline(input_dir, output_dir, on_progress=on_progress)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001 -- surface any failure to the client
        job.error = str(exc)
        job.status = "error"
