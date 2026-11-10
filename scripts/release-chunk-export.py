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
    statement = re.sub(r'\A(?:\s|--[^\n]*(?:\n|$)|/\*.*?\*/)*', '', statement, flags=re.S)
    match = re.fullmatch(r'INSERT INTO\s+(?:"((?:[^"]|"")+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))(?:\s*\(([^)]+)\))?\s+VALUES\s*\((.*)\)\s*;\s*', statement, re.S | re.I)
    if not match:
        raise ValueError("K9_BACKUP_INSERT_FORMAT")
    table = (match[1] or match[2] or match[3] or match[4]).replace('""', '"')
    info = db.execute("PRAGMA table_info(" + identifier(table) + ")").fetchall()
    row = db.execute("SELECT " + match[6]).fetchone()
    if match[5]:
        names = [part.strip().strip('"`[]') for part in match[5].split(',')]
        values = dict(zip(names, row))
        if set(values) != {col[1] for col in info}:
            raise ValueError("K9_BACKUP_COLUMNS")
        row = tuple(values[col[1]] for col in info)
    if not info or row is None or len(row) != len(info):
        raise ValueError("K9_BACKUP_ROW")
    primary = [i for i, col in enumerate(info) if col[5]]
    if not primary:
        raise ValueError("K9_BACKUP_PRIMARY_KEY")
    large = [i for i, value in enumerate(row) if len(literal(value).encode()) > 12_000]
    if not large or any(i in primary for i in large):
        raise ValueError("K9_BACKUP_LARGE_KEY")
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
        parts = list(statements(original))
        # D1 requires referenced tables to exist even with deferred foreign keys.
        # Native dumps may interleave CREATE child / INSERT child / CREATE parent.
        def is_data(statement):
            cleaned = re.sub(r'\A(?:\s|--[^\n]*(?:\n|$)|/\*.*?\*/)*', '', statement, flags=re.S)
            return bool(re.match(r'(INSERT|UPDATE|DELETE)\b', cleaned, re.I))
        schema = [part for part in parts if not is_data(part)]
        data = [part for part in parts if is_data(part)]
        with open(destination, "w", encoding="utf-8") as output:
            output.write("PRAGMA defer_foreign_keys=ON;\n")
            for statement in schema + data:
                replacement = [statement]
                if len(statement.encode()) > LIMIT:
                    replacement = list(split_insert(db, statement))
                    transformed += 1
                for part in replacement:
                    length = len(part.encode())
                    if length > LIMIT:
                        raise ValueError("K9_BACKUP_STATEMENT_LIMIT")
                    largest = max(largest, length)
                    output.write(part + "\n")
        if verify.snapshot(source) != verify.snapshot(destination):
            raise ValueError("K9_BACKUP_DATA_MISMATCH")
        return {"largeStatementsSplit": transformed, "maximumStatementBytes": largest, "dataPreserved": True}
    finally:
        db.close()


if __name__ == "__main__":
    try:
        print(json.dumps(chunk_export(*sys.argv[1:3])))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'K9_BACKUP_[A-Z_]+', str(error)) else getattr(error, 'sqlite_errorname', 'K9_BACKUP_UNKNOWN')
        print("Private receipt export preparation failed [" + code + "]; SQL and row values withheld.", file=sys.stderr)
        sys.exit(1)
