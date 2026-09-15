"""Create the demo seller and admin accounts in Supabase Auth + profiles.

Run from the backend folder after schema is applied:

    python scripts/seed_users.py
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_ROOT / ".env")

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY") or ""

USERS = [
    {
        "email": "seller@kidsailisting.com",
        "password": "SellerDemo123!",
        "full_name": "Demo Seller",
        "role": "seller",
    },
    {
        "email": "admin@kidsailisting.com",
        "password": "AdminDemo123!",
        "full_name": "Demo Admin",
        "role": "admin",
    },
]


def request(method: str, path: str, body: dict | None = None, extra_headers: dict | None = None):
    if not SUPABASE_URL or not SECRET_KEY:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in backend/.env")

    headers = {
        "apikey": SECRET_KEY,
        "Authorization": f"Bearer {SECRET_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc


def find_profile(email: str) -> dict | None:
    rows = request("GET", f"/rest/v1/profiles?email=eq.{urllib.parse.quote(email)}&select=id,role")
    return rows[0] if rows else None


def find_auth_user(email: str) -> dict | None:
    data = request("GET", "/auth/v1/admin/users?per_page=200") or {}
    for user in data.get("users") or []:
        if user.get("email") == email:
            return user
    return None


def upsert_profile(user_id: str, user: dict) -> None:
    request(
        "POST",
        "/rest/v1/profiles?on_conflict=id",
        {
            "id": user_id,
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )


def set_password(user_id: str, password: str) -> None:
    request("PUT", f"/auth/v1/admin/users/{user_id}", {"password": password, "email_confirm": True})


def create_user(user: dict) -> str:
    try:
        created = request(
            "POST",
            "/auth/v1/admin/users",
            {
                "email": user["email"],
                "password": user["password"],
                "email_confirm": True,
                "user_metadata": {"full_name": user["full_name"], "role": user["role"]},
            },
        )
        user_id = created["id"]
        print(f"Created auth user {user['email']} ({user_id})")
        upsert_profile(user_id, user)
        return user_id
    except RuntimeError:
        existing = find_profile(user["email"]) or find_auth_user(user["email"])
        if not existing or not existing.get("id"):
            raise
        print(f"Already exists {user['email']} ({existing['id']})")
        set_password(existing["id"], user["password"])
        upsert_profile(existing["id"], user)
        return existing["id"]


def main() -> None:
    for user in USERS:
        create_user(user)

    profiles = request("GET", "/rest/v1/profiles?select=email,role,full_name&order=created_at.asc")
    print("Profiles in database:")
    print(json.dumps(profiles, indent=2))


if __name__ == "__main__":
    main()
