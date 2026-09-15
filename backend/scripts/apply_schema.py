"""Apply backend/db/schema.sql to the configured Postgres database.

The hosted pooler rejects multi-statement prepared queries, so this splits
the file and runs each statement through `supabase db query`.

Run from the backend folder:

    python scripts/apply_schema.py
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = BACKEND_ROOT / "db" / "schema.sql"

load_dotenv(BACKEND_ROOT / ".env")


def split_sql(sql: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_dollar = False
    i = 0
    while i < len(sql):
        if sql[i : i + 2] == "$$":
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        if not in_dollar and sql[i] == ";":
            statement = "".join(buf).strip()
            if statement.replace("--", "").strip():
                parts.append(statement)
            buf = []
            i += 1
            continue
        buf.append(sql[i])
        i += 1
    leftover = "".join(buf).strip()
    if leftover:
        parts.append(leftover)
    return [part for part in parts if part.replace("--", "").strip()]


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("DATABASE_URL is missing from backend/.env")
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def main() -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    statements = split_sql(sql)
    db_url = database_url()

    with tempfile.TemporaryDirectory(prefix="schema-sql-") as tmp:
        for index, statement in enumerate(statements, start=1):
            preview = statement.splitlines()[0][:90]
            print(f"({index}/{len(statements)}) {preview}")
            file_path = Path(tmp) / f"stmt-{index:02d}.sql"
            file_path.write_text(f"{statement};\n", encoding="utf-8")
            subprocess.run(
                ["npx", "supabase", "db", "query", "--db-url", db_url, "-f", str(file_path)],
                check=True,
                shell=os.name == "nt",
            )
    print(f"Applied {len(statements)} statements from {SCHEMA_PATH.relative_to(BACKEND_ROOT)}")


if __name__ == "__main__":
    main()
