import io
import stat
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import ConnectionError
from hosting.__main__ import HostingWorker
from hosting.managed import BotHosting
from hosting.projects import Docker, ProjectError, Projects


class HostingTests(unittest.TestCase):
    def test_health_observation_is_opt_in_coarse_and_failure_safe(self):
        with tempfile.TemporaryDirectory() as folder:
            worker = HostingWorker({'OWNER_TELEGRAM_ID': '90001', 'BOT_TOKEN': 'fake'}, 'secret', Path(folder))
            self.addCleanup(worker.history.close)
            projects = [{'id': str(i)} for i in range(3)]
            with patch.dict('os.environ', {'K9_HOSTING_HEARTBEAT': '0'}), patch.object(worker, 'queue') as queue:
                worker.publish_health()
                queue.assert_not_called()
            with patch.dict('os.environ', {'K9_HOSTING_HEARTBEAT': '1'}), \
                 patch.object(worker.projects, 'list', return_value=projects), \
                 patch.object(worker.runtime, 'state', side_effect=['running · 10 MB', 'stopped', KeyError('private-runtime-detail')]), \
                 patch.object(worker, 'queue') as queue:
                worker.publish_health()
                worker.publish_health()
                queue.assert_called_once_with('heartbeat', runtime='docker', projects=3, running=1, unknown=1)
                self.assertNotIn('private-runtime-detail', str(queue.call_args))
            worker.health_after = 0
            with patch.dict('os.environ', {'K9_HOSTING_HEARTBEAT': '1'}), \
                 patch.object(worker.projects, 'list', return_value=[]), \
                 patch.object(worker, 'queue', side_effect=ConnectionError('private-connection-detail')), \
                 patch('builtins.print') as output:
                worker.publish_health()
                self.assertNotIn('private-connection-detail', str(output.call_args))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.projects = Projects(self.root)
        self.pid = '0000000000000001'

    def archive(self, *entries):
        path = self.root / 'upload'
        with zipfile.ZipFile(path, 'w') as archive:
            for name, content in entries:
                archive.writestr(name, content)
        return path

    def test_nested_zip_entry_choice_and_replay(self):
        source = self.archive(('လုပ်ငန်း/main.py', 'print(1)'), ('လုပ်ငန်း/next.js', 'console.log(1)'))
        app = self.projects.upload(self.pid, 'ကိုကို bots.zip', source)
        self.assertIsNone(app['entry'])
        self.assertEqual(app['choices'][0], 'လုပ်ငန်း/main.py')
        self.projects.select(app, 0)
        self.assertEqual(self.projects.upload(self.pid, 'different.py', source)['entry'], 'လုပ်ငန်း/main.py')
        self.assertEqual(len(self.projects.list()), 1)

    def test_archive_cannot_escape_or_create_symlink(self):
        link = zipfile.ZipInfo('link.py')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entry in ('../outside.py', '/outside.py', link):
            with self.subTest(entry=entry):
                source = self.archive((entry, 'target'))
                with self.assertRaises(ProjectError):
                    self.projects.upload(self.pid, 'unsafe.zip', source)
                self.assertFalse((self.projects.apps / self.pid).exists())

    def test_single_file_and_docker_arguments(self):
        source = self.root / 'upload'
        source.write_text('print(1)')
        app = self.projects.upload(self.pid, 'test.py', source)
        runtime = Docker(self.projects)
        with patch.object(runtime, 'cli', return_value='') as cli:
            runtime.create(app, runtime.name(app))
        args = cli.call_args.args
        self.assertIn('--read-only', args)
        self.assertIn('unless-stopped', args)
        self.assertIn('1000:1000', args)
        self.assertEqual(args[-3:], ('python', '-u', './test.py'))

    def test_docker_actions_use_persistent_container_state(self):
        source = self.root / 'upload'
        source.write_text('print(1)')
        app = self.projects.upload(self.pid, 'bot.py', source)
        runtime = Docker(self.projects)
        with patch.object(runtime, 'cli', return_value=None) as cli, \
             patch.object(runtime, 'state', side_effect=['not started', 'running']) as state:
            self.assertEqual(runtime.action(app, 'start'), 'Docker status: running')
        actions = [call.args[0] for call in cli.call_args_list]
        self.assertEqual(actions, ['image', 'build', 'create', 'start'])
        self.assertEqual(state.call_count, 2)

    def test_upload_and_retry_without_running_docker_twice(self):
        worker = HostingWorker({'OWNER_TELEGRAM_ID': '90001', 'BOT_TOKEN': 'fake'}, 'secret', self.root)
        self.addCleanup(worker.history.close)
        with patch('hosting.__main__.telegram', return_value={'file_path': 'documents/file_0.py'}), \
             patch('hosting.__main__.urlopen', return_value=io.BytesIO(b'print(1)')), \
             patch.object(worker.runtime, 'state', return_value='not started'):
            app = worker.upload(1, {'id': 'document', 'name': 'my bot.py', 'size': 8})
        self.assertIn('my bot.py', app['text'])
        job = {'id': 2, 'lease': 'test', 'payload': {'action': f'h:restart:{self.pid}'}}
        with patch.object(worker.runtime, 'state', return_value='running'), \
             patch.object(worker.runtime, 'action', return_value='Docker status: running') as action, \
             patch.object(worker, 'send', side_effect=[ConnectionError('offline'), {}]), \
             patch.object(worker, 'queue') as queue:
            with self.assertRaises(ConnectionError):
                worker.process(job)
            worker.process(job)
            worker.process(job)
        action.assert_called_once()
        self.assertEqual(queue.call_count, 2)

    def test_managed_staging_configures_nested_app_and_never_starts_it(self):
        source = self.archive(("nested bots/main.py", "print(1)"), ("requirements.txt", "example"))
        app = self.projects.upload(self.pid, 'managed.zip', source)
        with patch.dict('os.environ', {'BOT_HOSTING_API_KEY': 'bhk_test',
                                       'BOT_HOSTING_WORKER_ID': 'dep_worker',
                                       'BOT_HOSTING_CHILD_ID': 'dep_child'}):
            runtime = BotHosting(self.projects)
        child = {'owned': True, 'name': 'k9-hosted-child', 'runtime': 'python', 'state': 'offline'}
        with patch.object(runtime, 'call', side_effect=[child, {'ok': True}, {}]) as api, \
             patch.object(runtime, 'archive_upload', return_value='k9-project.zip'):
            self.assertIn('Staged.', runtime.stage(app))
        self.assertEqual([call.args[:2] for call in api.call_args_list], [
            ('GET', '/deployments/dep_child'), ('POST', '/deployments/dep_child/files/decompress'),
            ('PATCH', '/deployments/dep_child/startup')])
        config = api.call_args.args[2]
        self.assertIn("python -m pip install --disable-pip-version-check -r ./../requirements.txt", config['startCommand'])
        self.assertEqual(config['entryFile'], f'k9-project-{self.pid}/nested bots/main.py')
        self.assertTrue(self.projects.get(self.pid)['managed_staged'])

    def test_managed_upload_never_sends_api_key_to_signed_upload_url(self):
        with patch.dict('os.environ', {'BOT_HOSTING_API_KEY': 'bhk_test',
                                       'BOT_HOSTING_WORKER_ID': 'dep_worker',
                                       'BOT_HOSTING_CHILD_ID': 'dep_child'}):
            runtime = BotHosting(self.projects)
        with patch.object(runtime, 'call', return_value={'url': 'https://untrusted.example/files'}):
            with self.assertRaises(ProjectError):
                runtime.archive_upload(self.root, 'archive')
        with patch.object(runtime, 'call', return_value={'url': 'https://node.bot-hosting.net/upload', 'field': 'files'}), \
             patch.object(runtime.http, 'open', return_value=io.BytesIO()) as open_request:
            self.assertEqual(runtime.archive_upload(self.root, 'archive'), 'archive.zip')
        self.assertFalse(open_request.call_args.args[0].has_header('Authorization'))


if __name__ == '__main__':
    unittest.main()
