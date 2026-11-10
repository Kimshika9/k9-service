import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("chunk", Path(__file__).with_name("release-chunk-export.py"))
chunk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chunk)


class ReceiptBackupTests(unittest.TestCase):
    def test_binary_unicode_and_composite_keys_survive_chunking(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.execute("CREATE TABLE receipt_chunks (image_key TEXT,position INTEGER,data BLOB,note TEXT, PRIMARY KEY(image_key,position))")
        binary = bytes(range(256)) * 2048
        note = "မြန်မာ; ' quote\0" * 12_000
        db.execute("INSERT INTO receipt_chunks VALUES (?,?,?,?)", ("synthetic; 'key", 2, binary, note))
        db.execute("INSERT INTO receipt_chunks VALUES (?,?,?,?)", ("other", 0, None, "small"))
        with tempfile.TemporaryDirectory() as directory:
            original, restored = Path(directory) / "original.sql", Path(directory) / "restored.sql"
            # SQLite iterdump truncates NUL text, so retain it as a UTF-8 hex cast.
            original.write_text("CREATE TABLE receipt_chunks (image_key TEXT,position INTEGER,data BLOB,note TEXT, PRIMARY KEY(image_key,position));\n" +
                "INSERT INTO receipt_chunks VALUES (" + ",".join(chunk.literal(v) for v in ("synthetic; 'key", 2, binary, note)) + ");\n" +
                "INSERT INTO receipt_chunks VALUES ('other',0,NULL,'small');\n", encoding="utf-8")
            result = chunk.chunk_export(original, restored)
            self.assertEqual(result["largeStatementsSplit"], 1)
            self.assertLessEqual(result["maximumStatementBytes"], 90_000)
            self.assertEqual(chunk.verify.snapshot(original), chunk.verify.snapshot(restored))
            connection = sqlite3.connect(":memory:")
            self.addCleanup(connection.close)
            connection.executescript(restored.read_text())
            row = connection.execute("SELECT data,note FROM receipt_chunks WHERE position=2").fetchone()
            self.assertEqual(row, (binary, note))

    def test_statement_parser_respects_strings_and_comments(self):
        statements = list(chunk.statements("-- ignored;\nCREATE TABLE x(v); INSERT INTO x VALUES('a;''b'); /* ; */ SELECT 1;"))
        self.assertEqual(len(statements), 3)

    def test_referenced_schema_exists_before_child_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / "source.sql", Path(directory) / "target.sql"
            source.write_text("PRAGMA defer_foreign_keys=ON;\nCREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id));\nINSERT INTO child VALUES(1,7);\nCREATE TABLE parent(id INTEGER PRIMARY KEY);\nINSERT INTO parent VALUES(7);\n")
            chunk.chunk_export(source, target)
            sql = target.read_text()
            self.assertLess(sql.index('CREATE TABLE parent'), sql.index('INSERT INTO child'))
            self.assertLess(sql.index('INSERT INTO parent'), sql.index('INSERT INTO child'))
            db = sqlite3.connect(":memory:")
            self.addCleanup(db.close)
            db.executescript(sql)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            strict = sqlite3.connect(":memory:")
            self.addCleanup(strict.close)
            strict.execute('PRAGMA foreign_keys=ON')
            for statement in chunk.statements(sql):
                strict.execute(statement)
                strict.commit()
            self.assertEqual(strict.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == "__main__":
    unittest.main()
