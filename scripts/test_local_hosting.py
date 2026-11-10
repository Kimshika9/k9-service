"""Real Linux process tests; no Telegram, provider API or paid credentials."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hosting.local import Local, MB, LOG_LIMIT, group_memory, proc
from hosting.projects import Projects, ProjectError
from hosting.__main__ import HostingWorker


class LocalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.projects = Projects(self.root)
        self.env = patch.dict(os.environ, {'K9_HOSTING_MAX_RUNNING': '2',
                                          'K9_HOSTING_MEMORY_MB': '160', 'K9_HOSTING_DISK_MB': '320'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.runtime = Local(self.projects, ['manager-secret-not-for-child'])
        self.addCleanup(self.runtime.close)
        self.runtime.check()

    def project(self, number=1, code=None):
        code = code or 'import time\nprint("ready",flush=True)\nwhile True: time.sleep(0.1)\n'
        src = self.root / f'upload-{number}'
        src.write_text(code)
        project = self.projects.upload(f'{number:016x}', 'bot.py', src)
        self.runtime.action(project, 'stage')
        return self.projects.get(project['id'])

    def eventually(self, predicate, timeout=6):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.03)
        self.fail('Expected process result did not arrive')

    def test_two_real_bots_env_logs_stop_and_restore(self):
        code = ('import os,json,time\nfrom pathlib import Path\n'
                'Path("identity.json").write_text(json.dumps(dict(os.environ)))\n'
                'print("ready",os.getenv("BOT_TOKEN"),flush=True)\n'
                'while True: time.sleep(0.1)\n')
        a, b = self.project(1, code), self.project(2, code)
        values = {'BOT_TOKEN': 'manager-secret-not-for-child', 'K9_HOSTING_SECRET': 'queue-private',
                  'SITE_URL': 'https://private-manager.test', 'OTHER_ACCOUNT_KEY': 'private-key',
                  'K9_PROJECT_0000000000000001_BOT_TOKEN': 'child-one-secret',
                  'K9_PROJECT_0000000000000002_BOT_TOKEN': 'child-two-secret'}
        with patch.dict(os.environ, values):
            self.runtime.action(a, 'start')
            self.runtime.action(b, 'start')
            for project, token in [(a, 'child-one-secret'), (b, 'child-two-secret')]:
                path = self.runtime.folder(project) / 'source/identity.json'
                self.eventually(path.exists)
                env = json.loads(path.read_text())
                self.assertEqual(env['BOT_TOKEN'], token)
                self.assertNotIn('K9_HOSTING_SECRET', env)
                self.assertNotIn('OTHER_ACCOUNT_KEY', env)
                self.assertNotIn('SITE_URL', env)
                self.assertFalse(any(k.startswith('K9_PROJECT_') and k != 'K9_PROJECT_RUN_ID' for k in env))
                self.eventually(lambda: 'ready' in self.runtime.action(project, 'logs'))
                self.assertNotIn(token, self.runtime.action(project, 'logs'))
                self.assertIn('[redacted]', self.runtime.action(project, 'logs'))
            first_pid = self.runtime.running[a['id']]['process'].pid
            self.assertIn('running', self.runtime.state(a))
            self.assertGreater(group_memory(first_pid), 0)
            self.runtime.action(b, 'stop')
            self.runtime.close()
            # Desired state survives the worker restart; an explicit Stop remains stopped.
            second = Local(self.projects)
            self.addCleanup(second.close)
            second.check()
            second.tick()
            self.assertIn(a['id'], second.running)
            self.assertNotIn(b['id'], second.running)
            self.assertNotEqual(second.running[a['id']]['process'].pid, first_pid)

    def test_concurrency_limit_and_restart_do_not_duplicate(self):
        a, b, c = self.project(1), self.project(2), self.project(3)
        self.runtime.action(a, 'start')
        self.runtime.action(b, 'start')
        before = self.runtime.running[a['id']]['process'].pid
        self.runtime.action(a, 'start')
        self.assertEqual(self.runtime.running[a['id']]['process'].pid, before)
        with self.assertRaisesRegex(ProjectError, 'concurrent'):
            self.runtime.action(c, 'start')
        self.runtime.action(a, 'restart')
        self.assertNotEqual(self.runtime.running[a['id']]['process'].pid, before)
        self.assertEqual(len(self.runtime.running), 2)

    def test_bad_bot_stops_after_bounded_retries(self):
        project = self.project(code='raise SystemExit(7)\n')
        self.runtime.action(project, 'start')
        for _ in range(3):
            child = self.runtime.running[project['id']]['process']
            self.eventually(lambda: child.poll() is not None)
            self.runtime.tick()
            count, _ = self.runtime.retry[project['id']]
            self.runtime.retry[project['id']] = (count, 0)
            self.runtime.tick()
        saved = self.projects.get(project['id'])
        self.assertFalse(saved['local_desired'])
        self.assertIn('Repeated exits', self.runtime.state(project))
        self.assertNotIn(project['id'], self.runtime.running)

    def test_memory_guard_stops_and_prevents_auto_restart(self):
        project = self.project()
        self.runtime.action(project, 'start')
        with patch('hosting.local.group_memory', return_value=200 * MB):
            self.runtime.tick()
        self.assertFalse(self.projects.get(project['id'])['local_desired'])
        self.assertNotIn(project['id'], self.runtime.running)
        self.assertIn('memory budget', self.runtime.state(project))

    def test_disk_guard_and_log_rotation_are_bounded(self):
        project = self.project()
        for _ in range(5):
            self.runtime.log(project, 'x' * 100000)
        logs = list(self.runtime.folder(project).glob('runtime*.log'))
        self.assertLessEqual(len(logs), 2)
        self.assertTrue(all(p.stat().st_size <= LOG_LIMIT for p in logs))
        self.runtime.disk_limit = 1
        with self.assertRaisesRegex(ProjectError, 'disk budget'):
            self.runtime.action(project, 'start')

    def test_project_env_reserves_manager_and_runtime_names(self):
        project = self.project()
        path = self.runtime.env_file(project)
        path.write_text('BOT_TOKEN="own-token"\nAPI_KEY=own-api-key\n')
        path.chmod(0o600)
        self.assertEqual(self.runtime.project_env(project)['BOT_TOKEN'], 'own-token')
        self.assertNotIn('own-api-key', self.runtime.redact('own-api-key', project))
        path.chmod(0o644)
        with self.assertRaises(ProjectError):
            self.runtime.project_env(project)
        path.chmod(0o600)
        path.write_text('K9_HOSTING_SECRET=steal\n')
        with self.assertRaisesRegex(ProjectError, 'reserved'):
            self.runtime.project_env(project)

    def test_management_token_and_duplicate_child_token_are_rejected(self):
        a, b = self.project(1), self.project(2)
        with patch.dict(os.environ, {'K9_PROJECT_0000000000000001_BOT_TOKEN': 'manager-secret-not-for-child'}):
            with self.assertRaisesRegex(ProjectError, 'management token'):
                self.runtime.action(a, 'start')
        with patch.dict(os.environ, {'K9_PROJECT_0000000000000001_BOT_TOKEN': 'same-child-token',
                                    'K9_PROJECT_0000000000000002_BOT_TOKEN': 'same-child-token'}):
            self.runtime.action(a, 'start')
            with self.assertRaisesRegex(ProjectError, 'already uses'):
                self.runtime.action(b, 'start')

    def test_prepare_failure_does_not_leave_project_ready(self):
        project = self.project()
        with patch.object(self.runtime, 'install', side_effect=ProjectError('install failed')):
            with self.assertRaises(ProjectError):
                self.runtime.action(project, 'stage')
        self.assertFalse(self.projects.get(project['id'])['local_prepared'])
        with self.assertRaisesRegex(ProjectError, 'Prepare'):
            self.runtime.action(project, 'start')

    def test_python_dependency_install_and_versions_are_separate(self):
        projects = []
        for number, value in [(1, 'one'), (2, 'two')]:
            project = self.project(number, 'import k9fixture,time\nprint(k9fixture.VALUE,flush=True)\ntime.sleep(60)\n')
            source = self.runtime.folder(project) / 'source'
            wheel = source / 'k9fixture-1.0-py3-none-any.whl'
            with zipfile.ZipFile(wheel, 'w') as archive:
                archive.writestr('k9fixture.py', f'VALUE={value!r}\n')
                archive.writestr('k9fixture-1.0.dist-info/METADATA', 'Metadata-Version: 2.1\nName: k9fixture\nVersion: 1.0\n')
                archive.writestr('k9fixture-1.0.dist-info/WHEEL', 'Wheel-Version: 1.0\nGenerator: local-test\nRoot-Is-Purelib: true\nTag: py3-none-any\n')
                archive.writestr('k9fixture-1.0.dist-info/RECORD', '')
            (source / 'requirements.txt').write_text('./' + wheel.name + '\n')
            self.runtime.action(project, 'stage')
            projects.append((project, value))
        for project, value in projects:
            self.runtime.action(project, 'start')
            self.eventually(lambda: '\n' + value + '\n' in '\n' + self.runtime.action(project, 'logs'))

    def test_missing_node_is_actionable_and_delete_preserves_other_project(self):
        project = self.project()
        self.runtime.env_file(project).write_text('BOT_TOKEN=own-token\n')
        self.runtime.env_file(project).chmod(0o600)
        other = self.project(2)
        self.runtime.action(project, 'start')
        self.runtime.action(project, 'delete')
        self.assertFalse(self.runtime.folder(project).exists())
        self.assertFalse(self.runtime.env_file(project).exists())
        self.assertTrue(self.runtime.folder(other).exists())
        src = self.root / 'node-upload'
        src.write_text('console.log(1)')
        node = self.projects.upload('0000000000000003', 'index.js', src)
        with patch('hosting.local.shutil.which', return_value=None):
            with self.assertRaisesRegex(ProjectError, 'Node.js is not installed'):
                self.runtime.action(node, 'stage')

    def test_worker_local_mode_has_no_provider_key_or_child_requirement(self):
        worker = HostingWorker({'OWNER_TELEGRAM_ID': '90001'}, 'a' * 40, self.root, 'local')
        self.addCleanup(worker.history.close)
        self.addCleanup(worker.runtime.close)
        worker.runtime.check()
        self.assertTrue(worker.local)
        self.assertFalse(worker.managed)
        project = self.project()
        self.assertIn('Prepare runtime', str(worker.card({**project, 'local_prepared': False})))

    def test_supervisor_restores_running_intent_without_a_telegram_request(self):
        project = self.project()
        self.runtime.update(project, local_desired=True)
        self.runtime.start_supervisor()
        self.eventually(lambda: project['id'] in self.runtime.running)
        self.assertIn('running', self.runtime.state(project))

    def test_killed_parent_and_orphan_group_are_recovered_by_identity(self):
        code = ('import subprocess,sys,time\nfrom pathlib import Path\n'
                'child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"])\n'
                'Path("grandchild.pid").write_text(str(child.pid))\n'
                'while True: time.sleep(0.1)\n')
        project = self.project(code=code)
        parent_code = ('import sys,time\nfrom pathlib import Path\n'
                       'from hosting.local import Local\nfrom hosting.projects import Projects\n'
                       'r=Local(Projects(Path(sys.argv[1])))\nr.check()\n'
                       'r.action(r.projects.get("0000000000000001"),"start")\n'
                       'while True: time.sleep(0.1)\n')
        parent = subprocess.Popen([sys.executable, '-c', parent_code, str(self.root)])
        self.addCleanup(lambda: parent.poll() is None and (parent.kill(), parent.wait()))
        child_file = self.runtime.folder(project) / 'source/grandchild.pid'
        self.eventually(child_file.exists)
        record = json.loads((self.runtime.folder(project) / 'process.json').read_text())
        grandchild = int(child_file.read_text())
        parent.kill()
        parent.wait(timeout=3)
        self.eventually(lambda: (observed := proc(record['pid'])) is None or observed[2] == 0)
        # Startup verifies the saved run marker before killing the surviving process group.
        self.runtime.check()
        # The process may disappear between two /proc reads. Inspect one
        # observation so successful cleanup cannot itself make the test fail.
        self.eventually(lambda: (observed := proc(grandchild)) is None or observed[2] == 0)


if __name__ == '__main__':
    unittest.main()
