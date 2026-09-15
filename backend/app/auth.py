from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import Header, HTTPException

from app import db

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""


def _auth_user(access_token: str) -> dict[str, Any] | None:
    if not db.enabled():
        return None

    url = f"{db.SUPABASE_URL}/auth/v1/user"
    headers = {
        "apikey": PUBLISHABLE_KEY or db.SECRET_KEY,
        "Authorization": f"Bearer {access_token}",
    }
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError:
        return None


def resolve_user(authorization: str | None) -> dict[str, Any] | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None

    auth_user = _auth_user(token)
    if not auth_user or not auth_user.get("id"):
        return None

    profile = None
    try:
        profile = db.fetch_profile(auth_user["id"])
    except RuntimeError:
        profile = None

    return {
        "id": auth_user["id"],
        "email": auth_user.get("email") or (profile or {}).get("email"),
        "full_name": (profile or {}).get("full_name"),
        "role": (profile or {}).get("role") or "seller",
    }


def require_user(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    if not db.enabled():
        raise HTTPException(status_code=503, detail="Database is not configured")
    user = resolve_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user
