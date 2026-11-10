"""Compare two private D1 exports without printing their SQL or row values."""
import hashlib
import json
import sqlite3
import sys


def snapshot(filename):
    db = sqlite3.connect(":memory:")
    try:
        with open(filename, encoding="utf-8") as source:
            db.executescript(source.read())
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("integrity")
        tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").fetchall()
        result = {}
        for (name,) in tables:
            quoted = '"' + name.replace('"', '""') + '"'
            rows = db.execute("SELECT * FROM " + quoted).fetchall()
            # Canonicalize bytes, nulls, strings and numbers, independent of row order.
            encoded = sorted(json.dumps(row, ensure_ascii=True, separators=(",", ":"), default=lambda value: {"bytes": value.hex()}) for row in rows)
            digest = hashlib.sha256("\n".join(encoded).encode()).hexdigest()
            columns = db.execute("PRAGMA table_info(" + quoted + ")").fetchall()
            result[name] = {"rows": len(rows), "hash": digest, "columns": columns}
        return result
    finally:
        db.close()


if __name__ == "__main__":
    try:
        original, restored = map(snapshot, sys.argv[1:3])
        if not original or original != restored:
            raise ValueError("comparison")
        print(json.dumps({"restoreVerified": True, "tablesVerified": len(original)}))
    except Exception:
        print("Private backup restore verification failed; SQL and customer values withheld.", file=sys.stderr)
        sys.exit(1)
