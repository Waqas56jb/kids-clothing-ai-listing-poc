from __future__ import annotations

import mimetypes
from pathlib import Path

from app import db

BUCKET = "job-files"


def _headers(content_type: str | None = None, upsert: bool = False) -> dict[str, str]:
    key = db.SECRET_KEY or db.PUBLISHABLE_KEY
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    if upsert:
        headers["x-upsert"] = "true"
    return headers


def ensure_bucket() -> None:
    if not db.enabled():
        return
    try:
        db._request(
            "POST",
            "/storage/v1/bucket",
            {"id": BUCKET, "name": BUCKET, "public": False, "file_size_limit": 52_428_800},
            use_secret=True,
        )
    except RuntimeError as exc:
        if "already exists" not in str(exc).lower() and "(409)" not in str(exc):
            print(f"[storage] bucket create: {exc}")


def upload_bytes(storage_path: str, data: bytes, content_type: str | None = None) -> str:
    if not db.enabled():
        raise RuntimeError("Supabase is not configured")
    mime = content_type or mimetypes.guess_type(storage_path)[0] or "application/octet-stream"
    url = f"{db.SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    import urllib.error
    import urllib.request

    def send(method: str) -> None:
        request = urllib.request.Request(url, data=data, headers=_headers(mime, upsert=True), method=method)
        with urllib.request.urlopen(request, timeout=60):
            return

    try:
        send("POST")
    except urllib.error.HTTPError as exc:
        if exc.code in {400, 409}:
            send("PUT")
        else:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Storage upload failed ({exc.code}): {detail}") from exc
    return storage_path


def download_bytes(storage_path: str) -> tuple[bytes, str]:
    if not db.enabled():
        raise RuntimeError("Supabase is not configured")
    import urllib.error
    import urllib.request

    url = f"{db.SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    request = urllib.request.Request(url, headers=_headers(), method="GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            mime = response.headers.get("Content-Type") or mimetypes.guess_type(storage_path)[0] or "application/octet-stream"
            return response.read(), mime
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Storage download failed ({exc.code}): {detail}") from exc


def upload_tree(job_id: str, local_dir: Path, kind_for: str) -> list[str]:
    paths: list[str] = []
    if not local_dir.exists():
        return paths
    for file_path in local_dir.rglob("*"):
        if not file_path.is_file():
            continue
        relative = file_path.relative_to(local_dir).as_posix()
        storage_path = f"{job_id}/{relative}"
        upload_bytes(storage_path, file_path.read_bytes())
        kind = kind_for
        name = relative.lower()
        if "/masks/" in f"/{name}" or name.endswith("_masked.png"):
            kind = "mask"
        elif "/crops/" in f"/{name}" or name.endswith("_bbox.png"):
            kind = "crop"
        elif name.endswith(".json"):
            kind = "artifact"
        db.record_job_file(job_id, kind, storage_path)
        paths.append(storage_path)
    return paths


def upload_originals(job_id: str, local_dir: Path) -> list[str]:
    paths: list[str] = []
    if not local_dir.exists():
        return paths
    for file_path in sorted(local_dir.iterdir()):
        if not file_path.is_file():
            continue
        storage_path = f"{job_id}/originals/{file_path.name}"
        upload_bytes(storage_path, file_path.read_bytes())
        db.record_job_file(job_id, "original", storage_path)
        paths.append(storage_path)
    return paths


def startup() -> None:
    if db.enabled():
        ensure_bucket()
