"""Seed demo seller + admin accounts into AWS Postgres.

Run from the backend folder after DATABASE_URL is set:

    python scripts/seed_users.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from app import auth, db  # noqa: E402

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


def main() -> None:
    if not db.postgres_enabled():
        raise SystemExit("DATABASE_URL must be set in backend/.env")
    db.apply_schema()
    for user in USERS:
        profile = db.upsert_profile_credentials(
            user["email"],
            auth.hash_password(user["password"]),
            full_name=user["full_name"],
            role=user["role"],
        )
        print(f"Upserted {profile['email']} ({profile['id']}) role={profile['role']}")
    rows = db._pg_execute(
        "select email, role, full_name from public.profiles order by created_at asc",
        fetch="all",
    )
    print("Profiles in database:")
    print(json.dumps([dict(row) for row in (rows or [])], indent=2, default=str))


if __name__ == "__main__":
    main()
