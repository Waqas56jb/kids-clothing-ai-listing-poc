from __future__ import annotations

import mimetypes
import os
from functools import lru_cache
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from app import db

BUCKET = (os.getenv("S3_BUCKET") or "").strip()
REGION = (os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "eu-north-1").strip()
PREFIX = (os.getenv("S3_PREFIX") or "job-files").strip().strip("/")


class StorageNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    if not BUCKET:
        raise StorageNotConfigured("S3_BUCKET is not configured")
    kwargs = {"region_name": REGION}
    key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
    secret = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
    if key and secret:
        kwargs["aws_access_key_id"] = key
        kwargs["aws_secret_access_key"] = secret
    return boto3.client("s3", **kwargs)


def _key(storage_path: str) -> str:
    relative = storage_path.replace("\\", "/").lstrip("/")
    if not relative or ".." in relative.split("/"):
        raise RuntimeError("Invalid storage path")
    return f"{PREFIX}/{relative}" if PREFIX else relative


def ensure_bucket() -> None:
    if not BUCKET:
        print("[storage] S3_BUCKET not set — uploads will fail until configured")
        return
    client = _client()
    try:
        client.head_bucket(Bucket=BUCKET)
        return
    except ClientError:
        pass
    params: dict = {"Bucket": BUCKET}
    if REGION != "us-east-1":
        params["CreateBucketConfiguration"] = {"LocationConstraint": REGION}
    try:
        client.create_bucket(**params)
        print(f"[storage] created bucket s3://{BUCKET}")
    except ClientError as exc:
        code = (exc.response.get("Error") or {}).get("Code", "")
        if code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            print(f"[storage] bucket ensure failed: {exc}")


def upload_bytes(storage_path: str, data: bytes, content_type: str | None = None) -> str:
    if not BUCKET:
        raise StorageNotConfigured("S3_BUCKET is not configured")
    mime = content_type or mimetypes.guess_type(storage_path)[0] or "application/octet-stream"
    _client().put_object(
        Bucket=BUCKET,
        Key=_key(storage_path),
        Body=data,
        ContentType=mime,
    )
    return storage_path


def download_bytes(storage_path: str) -> tuple[bytes, str]:
    if not BUCKET:
        raise StorageNotConfigured("S3_BUCKET is not configured")
    try:
        obj = _client().get_object(Bucket=BUCKET, Key=_key(storage_path))
    except ClientError as exc:
        raise RuntimeError(f"Storage download failed: {storage_path}") from exc
    body = obj["Body"].read()
    mime = obj.get("ContentType") or mimetypes.guess_type(storage_path)[0] or "application/octet-stream"
    return body, mime


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
        if "/masks/" in f"/{name}" or "/cutouts/" in f"/{name}" or name.endswith("_masked.png"):
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
    ensure_bucket()
