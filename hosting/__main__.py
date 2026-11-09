"""Process owner Hosting jobs; Service Bot orders and webhook remain on Cloudflare."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import shutil
import signal
import sqlite3
import sys
import tempfile
import time
from html import escape
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import urlopen

from bot import ConnectionError, load_config, request_json, telegram, validate, website_check
from emoji_manager import EmojiManager
from .managed import BotHosting
from .local import Local
from .projects import Docker, MAX_UPLOAD, ProjectError, Projects, RUNTIMES


def button(label: str, action: str) -> dict:
    return {'text': label, 'callback_data': 'h:' + action}


class HostingWorker:
    def __init__(self, config: dict, secret: str, root: Path, mode: str = "docker"):
        self.config = config
        self.secret = secret
        self.owner = int(config['OWNER_TELEGRAM_ID'])
        self.projects = Projects(root)
        self.managed = mode == "bot-hosting"
        self.local = mode == 'local'
        self.runtime = (Local(self.projects, [config.get('BOT_TOKEN'), config.get('TELEGRAM_WEBHOOK_SECRET'), secret])
                        if self.local else BotHosting(self.projects) if self.managed else Docker(self.projects))
        self.history = sqlite3.connect(root / 'job-results.sqlite')
        self.history.execute('CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, result TEXT, done INTEGER)')

    def queue(self, operation: str, **fields) -> dict:
        return request_json(self.config['SITE_URL'] + '/api/hosting/queue',
                            {'op': operation, 'ownerId': str(self.owner), **fields}, {'x-k9-hosting-secret': self.secret}, timeout=20)

    def send(self, text: str, rows: list | None = None, *, rich: bool = True) -> dict:
        roles = self.queue('emojis')['roles']
        return EmojiManager(roles).send(self.config, self.owner, text, rows=rows, rich=rich)

    def menu(self) -> dict:
        return {'text': 'Upload and manage your bot projects.', 'rich': True,
                'rows': [[button('Upload project', 'upload'), button('My projects', 'list')],
                         [button('Owner menu', 'exit')]]}

    def card(self, project: dict, notice: str = '') -> dict:
        pid = project['id']
        if project['entry'] is None:
            return self.choices(project, 0)
        status = self.runtime.state(project)
        controls = [[button('Start', f'start:{pid}'), button('Stop', f'stop:{pid}'),
                     button('Restart', f'restart:{pid}')]]
        if self.managed and not project.get('managed_staged') or self.local and not project.get('local_prepared'):
            controls = [[button('Prepare runtime' if self.local else 'Stage deployment', f'stage:{pid}')]]
        return {'text': '\n'.join(filter(None, [notice, project['name'], 'Project ID  ' + pid,
                         f"Entry  {project['entry']}", f"Status  {status}"])),
                'rows': controls + [[button('Logs', f'logs:{pid}'), button('Refresh', f'view:{pid}'),
                          button('Delete…', f'confirm:{pid}')],
                         [button('My projects', 'list')]]}

    def choices(self, project: dict, page: int) -> dict:
        pid = project['id']
        entries = project['choices']
        page = max(0, min(page, (len(entries) - 1) // 8))
        rows = [[button(f'{index + 1}. ' + entries[index][-45:], f'entry:{pid}:{index}')]
                for index in range(page * 8, min(page * 8 + 8, len(entries)))]
        navigation = []
        if page:
            navigation.append(button('Previous', f'choices:{pid}:{page - 1}'))
        if (page + 1) * 8 < len(entries):
            navigation.append(button('Next', f'choices:{pid}:{page + 1}'))
        if navigation:
            rows.append(navigation)
        rows.append([button('My projects', 'list'), button('Delete…', f'confirm:{pid}')])
        return {'text': f"{project['name']}\nSelect the startup file.", 'rows': rows}

    def upload(self, job_id: int, file: dict) -> dict:
        pid = f'{job_id:016x}'
        if (self.projects.apps / pid).exists():
            return self.card(self.projects.get(pid), 'Upload saved.')
        if self.managed and self.projects.list():
            raise ProjectError('Starter has one child slot. Remove the previous project before uploading another.')
        if self.local:
            self.runtime.guard()
        name, file_id, size = (file.get(key) for key in ('name', 'id', 'size'))
        if not isinstance(name, str) or Path(name).suffix.lower() not in {*RUNTIMES, '.zip'}:
            raise ProjectError('Upload a .py, .js or .zip document.')
        if not isinstance(size, int) or not 0 < size <= MAX_UPLOAD or not isinstance(file_id, str):
            raise ProjectError('The document is empty or exceeds Telegram’s 20 MB download limit.')
        info = telegram(self.config, 'getFile', {'file_id': file_id}, timeout=20)
        path = info.get('file_path')
        if not isinstance(path, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', path) or '..' in path.split('/'):
            raise ProjectError('Telegram could not provide a downloadable file.')
        url = f"https://api.telegram.org/file/bot{self.config['BOT_TOKEN']}/{quote(path, safe='/')}"
        try:
            with tempfile.TemporaryDirectory(dir=self.projects.root) as tmp:
                source = Path(tmp) / 'upload'
                start = time.monotonic()
                with urlopen(url, timeout=20) as response, source.open('wb') as output:
                    written = 0
                    while chunk := response.read(256 * 1024):
                        written += len(chunk)
                        if written > MAX_UPLOAD or time.monotonic() - start > 90:
                            raise ProjectError('The file is too large or took too long to download.')
                        output.write(chunk)
                if written != size:
                    raise ProjectError('The file download was incomplete. Please upload again.')
                project = self.projects.upload(pid, name, source)
        except (URLError, OSError):
            raise ProjectError('The file download or storage failed. Please upload again.') from None
        if self.local:
            try:
                self.runtime.guard()
            except ProjectError:
                shutil.rmtree(self.projects.apps / pid)
                raise
        return self.card(project, 'Upload saved.')

    def handle(self, job_id: int, payload: dict) -> dict:
        if 'file' in payload:
            return self.upload(job_id, payload['file'])
        _, action, *args = payload['action'].split(':')
        if action == 'menu':
            return self.menu()
        if action == 'exit':
            return {'text': 'K9 Owner Control', 'rows': [
                [{'text': 'Open Owner Page', 'web_app': {'url': self.config['SITE_URL'] + '/owner'}}],
                [button('Hosting', 'menu')]]}
        if action == 'upload':
            return {'prompt': True}
        if action == 'list':
            projects = self.projects.list()
            return {'text': f'Hosted projects  ·  {len(projects)}',
                    'rows': [[button(p['name'], 'view:' + p['id'])] for p in projects]
                            + [[button('Upload', 'upload'), button('Hosting', 'menu')]]}
        if not args:
            raise ProjectError('This button is no longer available.')
        project = self.projects.get(args[0])
        pid = project['id']
        if action == 'view':
            return self.card(project)
        if action in {'choices', 'entry'} and len(args) == 2 and args[1].isdigit():
            index = int(args[1])
            if action == 'choices':
                return self.card(project) if project['entry'] else self.choices(project, index)
            return self.card(self.projects.select(project, index))
        if action == 'confirm':
            detail = 'The child deployment and its data will also be deleted.' if self.managed and project.get('managed_id') else 'Saved project data will also be removed.'
            return {'text': f"Delete {project['name']}? {detail}",
                    'rows': [[button('Delete project', f'delete:{pid}'), button('Cancel', f'view:{pid}')]]}
        if action not in {'start', 'stop', 'restart', 'logs', 'delete'} and not ((self.managed or self.local) and action == 'stage'):
            raise ProjectError('This button is no longer available.')
        result = self.runtime.action(project, action)
        if action == 'delete':
            return {'text': result, 'rows': [[button('My projects', 'list')]]}
        if action == 'logs':
            return {'text': result, 'rows': [[button('Back', f'view:{pid}')]]}
        return self.card(project, result)

    def process(self, job: dict) -> None:
        job_id = job['id']
        row = self.history.execute('SELECT result, done FROM jobs WHERE id=?', (job_id,)).fetchone()
        if not row:
            try:
                reply = self.handle(job_id, job['payload'])
            except ProjectError as exc:
                reply = {'text': str(exc), 'rows': [[button('Hosting', 'menu')]]}
            except ConnectionError as exc:
                if exc.code in {0, 429} or exc.code >= 500:
                    raise
                reply = {'text': 'Telegram rejected the request. Open Hosting and try again.'}
            except (OSError, ValueError, TypeError, KeyError):
                reply = {'text': 'Could not process this job. Check the hosting console and reopen Hosting.'}
            self.history.execute('INSERT INTO jobs VALUES (?, ?, ?)', (job_id, json.dumps(reply), int(time.time())))
            self.history.execute('DELETE FROM jobs WHERE done < ?', (int(time.time()) - 86400,))
            self.history.commit()
        elif row[0] is None:
            self.queue('ack', id=job_id, lease=job['lease'])
            return
        else:
            reply = json.loads(row[0])
        try:
            if reply.get('prompt'):
                EmojiManager(self.queue('emojis')['roles']).send(self.config, self.owner,
                         'K9 Hosting · Reply here with a .py, .js or .zip document (up to 20 MB).',
                         rich=False, prefix=False, reply_markup={'force_reply': True})
            else:
                self.send(**reply)
        except ConnectionError as exc:
            if exc.code in {0, 429} or exc.code >= 500:
                raise
            print('Telegram rejected the hosting reply.', flush=True)
        self.history.execute('UPDATE jobs SET result=NULL WHERE id=?', (job_id,))
        self.history.commit()
        self.queue('ack', id=job_id, lease=job['lease'])


def stop_worker(*_) -> None:
    raise KeyboardInterrupt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check the hosting runtime, Telegram and the Worker queue')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        config = validate(load_config())
        secret = os.getenv('K9_HOSTING_SECRET', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', secret) or secret == config['TELEGRAM_WEBHOOK_SECRET']:
            raise ProjectError('Set a separate K9_HOSTING_SECRET of 32–128 letters, digits, _ or -.')
        mode = os.getenv('K9_HOSTING_RUNTIME', 'docker')
        if mode not in {'docker', 'bot-hosting', 'local'}:
            raise ProjectError('K9_HOSTING_RUNTIME must be local, docker or bot-hosting.')
        root = Path(os.environ['K9_HOSTING_DIR']).expanduser().resolve()
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
        if root.stat().st_mode & 0o077:
            raise ProjectError('K9_HOSTING_DIR must be private (chmod 700).')
        with (root / 'worker.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ProjectError('A hosting worker is already using this data directory.') from None
            worker = HostingWorker(config, secret, root, mode)
            previous_term = signal.signal(signal.SIGTERM, stop_worker)
            try:
                worker.runtime.check()
                website_check(config, telegram(config, 'getMe'))
                info = telegram(config, 'getWebhookInfo')
                if info.get('url') != config['SITE_URL'] + '/api/telegram/webhook':
                    raise ProjectError('Connect the Service Bot webhook with python3 bot.py --connect first.')
                worker.queue('check')
                print(f'K9 Hosting is connected to {worker.runtime.label} and the Cloudflare queue.', flush=True)
                if args.check:
                    return 0
                if worker.local:
                    worker.runtime.start_supervisor()
                pending = None
                idle = 2
                while True:
                    try:
                        pending = pending or worker.queue('claim')['job']
                        if pending:
                            worker.process(pending)
                            pending = None
                            idle = 2
                        else:
                            time.sleep(idle)
                            idle = min(idle + 1, 10)
                    except ConnectionError as exc:
                        if exc.code in {401, 403, 409}:
                            raise
                        print('Hosting connection interrupted. Retrying.', flush=True)
                        time.sleep(min(30, max(3, exc.retry_after)))
            finally:
                if worker.local:
                    worker.runtime.close()
                worker.history.close()
                signal.signal(signal.SIGTERM, previous_term)
    except KeyboardInterrupt:
        return 0
    except (ConnectionError, ProjectError) as exc:
        print(f'K9 Hosting: {exc}', file=sys.stderr)
    except (OSError, KeyError, sqlite3.Error):
        print('K9 Hosting: Set K9_HOSTING_DIR to a writable private data directory.', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
