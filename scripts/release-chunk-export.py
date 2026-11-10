"""Make large receipt INSERTs importable under D1's SQL statement limit.

Only private backup SQL is transformed. Production rows are never updated.
The transformed export is compared with the original before any upload.
"""
import json
import math
import re
import sqlite3
import sys
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("release_verify", Path(__file__).with_name("release-verify-export.py"))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
LIMIT = 90_000


def statements(source):
    start, offset, quote, comment = 0, 0, None, None
    while offset < len(source):
        ch = source[offset]
        following = source[offset:offset + 2]
        if comment == "line":
            if ch == "\n":
                comment = None
        elif comment == "block":
            if following == "*/":
                comment = None
                offset += 1
        elif quote:
            closing = "]" if quote == "[" else quote
            if ch == closing:
                if source[offset + 1:offset + 2] == closing and quote != "[":
                    offset += 1
                else:
                    quote = None
        elif following in ("--", "/*"):
            comment = "line" if following == "--" else "block"
            offset += 1
        elif ch in ("'", '"', "`", "["):
            quote = ch
        elif ch == ";":
            yield source[start:offset + 1]
            start = offset + 1
        offset += 1
    if source[start:].strip():
        yield source[start:]


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, str):
        if "\0" in value:
            return "CAST(X'" + value.encode().hex() + "' AS TEXT)"
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, float) and math.isinf(value):
        return "9e999" if value > 0 else "-9e999"
    return repr(value)


def split_insert(db, statement):
    # Native D1 exports use SQLite INSERT ... VALUES, never arbitrary scripts.
    match = re.fullmatch(r'\s*INSERT INTO\s+(?:"((?:[^"]|"")+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s+VALUES\s*\((.*)\)\s*;\s*', statement, re.S | re.I)
    if not match:
        raise ValueError("Unsupported oversized statement")
    table = (match[1] or match[2] or match[3]).replace('""', '"')
    info = db.execute("PRAGMA table_info(" + identifier(table) + ")").fetchall()
    row = db.execute("SELECT " + match[4]).fetchone()
    if not info or row is None or len(row) != len(info):
        raise ValueError("Invalid exported row")
    primary = [i for i, col in enumerate(info) if col[5]]
    if not primary:
        raise ValueError("Oversized row has no primary key")
    large = [i for i, value in enumerate(row) if len(literal(value).encode()) > 12_000]
    if not large or any(i in primary for i in large):
        raise ValueError("Oversized primary key or row structure")
    columns = [identifier(col[1]) for col in info]
    initial = [literal(b"" if isinstance(value, bytes) else "") if i in large else literal(value) for i, value in enumerate(row)]
    yield "INSERT INTO " + identifier(table) + " (" + ",".join(columns) + ") VALUES (" + ",".join(initial) + ");"
    where = " AND ".join(columns[i] + " IS " + literal(row[i]) for i in primary)
    for i in large:
        value = row[i]
        # 8K Unicode characters or 16K bytes keeps even hex/NUL SQL below 90KB.
        size = 16_000 if isinstance(value, bytes) else 8_000
        for offset in range(0, len(value), size):
            expression = columns[i] + " || " + literal(value[offset:offset + size])
            if isinstance(value, bytes):
                expression = "CAST(" + expression + " AS BLOB)"
            yield "UPDATE " + identifier(table) + " SET " + columns[i] + "=" + expression + " WHERE " + where + ";"


def chunk_export(source, destination):
    original = Path(source).read_text(encoding="utf-8")
    db = sqlite3.connect(":memory:")
    transformed, largest = 0, 0
    try:
        db.executescript(original)
        with open(destination, "w", encoding="utf-8") as output:
            for statement in statements(original):
                replacement = [statement]
                if len(statement.encode()) > LIMIT:
                    replacement = list(split_insert(db, statement))
                    transformed += 1
                for part in replacement:
                    length = len(part.encode())
                    if length > LIMIT:
                        raise ValueError("Statement still exceeds safe limit")
                    largest = max(largest, length)
                    output.write(part + "\n")
        if verify.snapshot(source) != verify.snapshot(destination):
            raise ValueError("Transformed export changed data")
        return {"largeStatementsSplit": transformed, "maximumStatementBytes": largest, "dataPreserved": True}
    finally:
        db.close()


if __name__ == "__main__":
    try:
        print(json.dumps(chunk_export(*sys.argv[1:3])))
    except Exception:
        print("Private receipt export preparation failed; SQL and row values withheld.", file=sys.stderr)
        sys.exit(1)
