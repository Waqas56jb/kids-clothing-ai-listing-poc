from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException

from app import db

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "kids-ai-dev-secret-change-me"
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS") or "168")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _public_profile(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "email": row.get("email"),
        "full_name": row.get("full_name"),
        "role": row.get("role") or "seller",
    }


def issue_token(profile: dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(profile["id"]),
        "email": profile.get("email"),
        "role": profile.get("role") or "seller",
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def register_user(email: str, password: str, full_name: str | None = None, role: str = "seller") -> dict[str, Any]:
    if not db.postgres_enabled():
        raise RuntimeError("DATABASE_URL is not set")
    email = email.strip().lower()
    if db.fetch_profile_by_email(email):
        raise ValueError("Email already registered")
    profile = db.create_profile(email, hash_password(password), full_name=full_name, role=role)
    token = issue_token(profile)
    return {"access_token": token, "user": _public_profile(profile), "profile": _public_profile(profile)}


def login_user(email: str, password: str) -> dict[str, Any]:
    if not db.postgres_enabled():
        raise RuntimeError("DATABASE_URL is not set")
    profile = db.fetch_profile_by_email(email)
    if not profile or not verify_password(password, profile.get("password_hash")):
        raise ValueError("Invalid email or password")
    token = issue_token(profile)
    return {"access_token": token, "user": _public_profile(profile), "profile": _public_profile(profile)}


def resolve_user(authorization: str | None) -> dict[str, Any] | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    claims = decode_token(token)
    if not claims or not claims.get("sub"):
        return None
    profile = db.fetch_profile(str(claims["sub"]))
    if not profile:
        return None
    public = _public_profile(profile)
    return {**public, "access_token": token}


def require_user(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    if not db.postgres_enabled():
        raise HTTPException(status_code=503, detail="Database is not configured")
    user = resolve_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user
