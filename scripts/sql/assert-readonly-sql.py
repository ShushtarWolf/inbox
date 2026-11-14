#!/usr/bin/env python3
"""Fail if a .sql file may contain writes (comments stripped). Used by readonly-sql-reports CI."""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Whole-word DDL/DML (PostgreSQL).
BANNED_WORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|CALL)\b",
    re.IGNORECASE,
)
COPY_FROM = re.compile(r"\bCOPY\b[\s\S]*?\bFROM\b", re.IGNORECASE)
DO_BLOCK = re.compile(r"\bDO\s*\$\$", re.IGNORECASE)


def strip_sql_comments(text: str) -> str:
    out: list[str] = []
    i = 0
    n = len(text)
    in_line = False
    in_block = False
    while i < n:
        if in_block:
            end = text.find("*/", i)
            if end == -1:
                break
            i = end + 2
            in_block = False
            continue
        if in_line:
            if text[i] == "\n":
                in_line = False
                out.append("\n")
            i += 1
            continue
        if text.startswith("/*", i):
            in_block = True
            i += 2
            continue
        if text.startswith("--", i):
            in_line = True
            i += 2
            continue
        out.append(text[i])
        i += 1
    return "".join(out)


def check_file(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    body = strip_sql_comments(raw)
    issues: list[str] = []
    for m in BANNED_WORDS.finditer(body):
        issues.append(f"banned keyword {m.group(0).upper()} near offset {m.start()}")
    if COPY_FROM.search(body):
        issues.append("COPY ... FROM")
    if DO_BLOCK.search(body):
        issues.append("DO $$ anonymous block")
    return issues


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: assert-readonly-sql.py <file.sql> ...", file=sys.stderr)
        return 2
    failed = False
    for arg in sys.argv[1:]:
        p = Path(arg)
        if not p.is_file():
            print(f"::warning::Skipping missing file {p}")
            continue
        issues = check_file(p)
        if issues:
            failed = True
            print(f"::error::{p} is not read-only: " + "; ".join(issues))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
