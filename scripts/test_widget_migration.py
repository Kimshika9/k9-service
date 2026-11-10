"""Verify an additive upgrade preserves every pre-existing table and row."""
import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class WidgetMigrationTests(unittest.TestCase):
    def test_fallback_upgrade_preserves_existing_widget_and_business_rows(self):
        connection = sqlite3.connect(':memory:')
        self.addCleanup(connection.close)
        migrations = sorted((ROOT / 'drizzle').glob('*.sql'))
        for migration in migrations[:5]:
            connection.executescript(migration.read_text())
        connection.execute("INSERT INTO settings VALUES ('telegram.emoji.order','saved-role')")
        connection.execute("INSERT INTO telegram_widget_messages VALUES ('90001',42,'90001','owner','','my',1,1,100,999999)")
        connection.execute("INSERT INTO telegram_widget_queries VALUES ('query',1,'90001',100)")
        before = connection.execute('SELECT * FROM telegram_widget_messages').fetchall()
        upgrade = migrations[5].read_text()
        self.assertNotRegex(upgrade.upper(), r'\b(DROP|DELETE|UPDATE|INSERT|REPLACE)\b')
        connection.executescript(upgrade)
        after = connection.execute('SELECT * FROM telegram_widget_messages').fetchall()
        self.assertEqual(before, [row[:10] for row in after])
        self.assertEqual(after[0][10:], (None, 1))
        self.assertEqual(connection.execute('SELECT * FROM settings').fetchall(), [('telegram.emoji.order', 'saved-role')])
        self.assertEqual(connection.execute('SELECT * FROM telegram_widget_queries').fetchall(), [('query', 1, '90001', 100)])
        self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_preserves_existing_data_and_schema(self):
        connection = sqlite3.connect(':memory:')
        self.addCleanup(connection.close)
        migrations = sorted((ROOT / 'drizzle').glob('*.sql'))
        for migration in migrations[:4]:
            connection.executescript(migration.read_text())
        connection.execute("INSERT INTO settings VALUES ('telegram.emoji.order','owner-saved-value')")
        connection.execute("INSERT INTO services VALUES ('private-service','{}','2026-11-09')")
        connection.execute("INSERT INTO bot_sessions VALUES ('90002','{\"draft\":true}','2026-11-09')")
        connection.execute("INSERT INTO webhook_updates VALUES (123,'2026-11-09')")
        connection.execute("INSERT INTO hosting_jobs VALUES (1,'{\"job\":\"saved\"}',1,10,'lease')")
        connection.execute("""INSERT INTO orders (id,customer_key,customer,contact,service_id,service_name,details,source,history,created_at,updated_at)
            VALUES ('K9-test','tg:90002','Synthetic','QA','test','Service','Brief','Mini App','[]','2026-11-09','2026-11-09')""")
        connection.execute("INSERT INTO payments VALUES ('payment','K9-test','KBZPay','SYNTHETIC-ONLY','QA',100,'Proof Submitted','receipt','image/png','','2026-11-09',NULL,NULL)")
        connection.execute("INSERT INTO order_events VALUES ('event','K9-test','tg:90002','customer','created','','Pending Review','','{}','2026-11-09')")
        connection.execute("INSERT INTO receipt_images VALUES ('receipt','image/png',3,'2026-11-09')")
        connection.execute("INSERT INTO receipt_chunks VALUES ('receipt',0,X'010203')")

        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_schema WHERE type='table'")]

        def digest(table):
            # sqlite identifiers are taken only from sqlite_schema, never user input.
            schema = connection.execute('SELECT sql FROM sqlite_schema WHERE name=?', (table,)).fetchone()
            rows = connection.execute('SELECT * FROM "' + table + '"').fetchall()
            return hashlib.sha256(repr((schema, rows)).encode()).hexdigest()

        before = {table: digest(table) for table in tables}
        upgrade = migrations[4].read_text()
        self.assertNotRegex(upgrade.upper(), r'\b(DROP|DELETE|UPDATE|ALTER|INSERT|REPLACE)\b')
        connection.executescript(upgrade)
        self.assertEqual(before, {table: digest(table) for table in tables})
        self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(connection.execute('PRAGMA foreign_key_check').fetchall(), [])
        snapshot = json.loads((ROOT / 'drizzle/meta/0004_snapshot.json').read_text())
        self.assertTrue({'telegram_widget_messages', 'telegram_widget_queries', 'hosting_health'} <= snapshot['tables'].keys())


if __name__ == '__main__':
    unittest.main()
