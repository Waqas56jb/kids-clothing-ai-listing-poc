"""Apply backend/db/schema.sql to the configured Postgres database.

Run from the backend folder:

    python scripts/apply_schema.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app import db  # noqa: E402


def main() -> None:
    if not db.postgres_enabled():
        raise SystemExit("DATABASE_URL is missing from backend/.env")
    count = db.apply_schema()
    print(f"Applied {count} statements from backend/db/schema.sql")
    print(db.ping())


if __name__ == "__main__":
    main()
