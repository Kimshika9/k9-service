"""Small, trusted-owner projects in one Linux deployment; no container isolation."""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid

from .projects import ProjectError, Projects

MB = 1024 * 1024
LOG_LIMIT = 128 * 1024
BOOT = Path('/proc/sys/kernel/random/boot_id')


def option(name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        raise ProjectError(f'{name} must be a whole number.') from None
    if not low <= value <= high:
        raise ProjectError(f'{name} must be between {low} and {high}.')
    return value


def proc(pid: int):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(') ', 1)[1].split()
        return int(fields[2]), int(fields[19]), int(fields[21]) * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError):
        return None


def group_memory(pid: int) -> int:
    total = 0
    for item in Path('/proc').iterdir():
        if item.name.isdigit():
            record = proc(int(item.name))
            if record and record[0] == pid:
                total += record[2]
    return total


class Local:
    label = 'single-deployment runner'

    def __init__(self, projects: Projects, management_secrets=()):
        self.projects = projects
        self.max_running = option('K9_HOSTING_MAX_RUNNING', 2, 1, 4)
        self.memory_limit = option('K9_HOSTING_MEMORY_MB', 160, 32, 4096) * MB
        self.disk_limit = option('K9_HOSTING_DISK_MB', 320, 32, 102400) * MB
        self.secret_values = tuple(str(v) for v in management_secrets if v)
        self.running: dict[str, dict] = {}
        self.retry: dict[str, tuple[int, float]] = {}
        self.lock = threading.RLock()
        self.log_lock = threading.Lock()
        self.done = threading.Event()
        self.thread = None
        self.boot = BOOT.read_text().strip() if BOOT.exists() else ''

    def folder(self, project: dict) -> Path:
        return self.projects.apps / project['id']

    def env_file(self, project: dict) -> Path:
        return self.projects.secrets / (project['id'] + '.env')

    def project_env(self, project: dict) -> dict[str, str]:
        path = self.env_file(project)
        values = {}
        if path.exists():
            if path.is_symlink() or path.stat().st_mode & 0o077:
                raise ProjectError('Keep the project env file private (chmod 600), with no symlink.')
            if path.stat().st_size > 32768:
                raise ProjectError('Project env file is too large.')
            lines = path.read_text().splitlines()
        else:
            lines = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, sep, value = line.partition('=')
            if not sep or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
                raise ProjectError('Use KEY=value lines in the project env file.')
            if value[:1] in {'"', "'"} and value[-1:] == value[:1]:
                value = value[1:-1]
            values[key] = value
        prefix = 'K9_PROJECT_' + project['id'].upper() + '_'
        values.update({key[len(prefix):]: value for key, value in os.environ.items() if key.startswith(prefix)})
        for key, value in values.items():
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or '\x00' in value or key.startswith(('K9_', 'BOT_HOSTING_', 'LD_', 'PYTHON')) or key in {
                'OWNER_TELEGRAM_ID', 'TELEGRAM_WEBHOOK_SECRET', 'SITE_URL', 'HOME', 'PATH',
                'TMPDIR', 'VIRTUAL_ENV', 'NODE_OPTIONS', 'NODE_PATH'}:
                raise ProjectError('Project env contains a reserved manager/runtime setting.')
        return values

    def environment(self, project: dict) -> dict[str, str]:
        folder = self.folder(project)
        for name in ('home', 'tmp'):
            (folder / name).mkdir(exist_ok=True, mode=0o700)
        # Never inherit the service token, queue secret, API keys or parent PYTHONPATH.
        env = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL', 'TZ') if key in os.environ}
        env.update(HOME=str(folder / 'home'), TMPDIR=str(folder / 'tmp'),
                   PYTHONUNBUFFERED='1', PYTHONNOUSERSITE='1', PYTHONDONTWRITEBYTECODE='1')
        if (folder / 'venv/bin/python').exists():
            env['VIRTUAL_ENV'] = str(folder / 'venv')
            env['PATH'] = str(folder / 'venv/bin') + os.pathsep + env.get('PATH', os.defpath)
        env.update(self.project_env(project))
        if env.get('BOT_TOKEN') and env['BOT_TOKEN'] in self.secret_values:
            raise ProjectError('Use this project\'s own bot token, not the K9 Service management token.')
        return env

    def redact(self, value: str, project: dict) -> str:
        with contextlib.suppress(OSError, ProjectError, UnicodeError):
            for secret in sorted(self.project_env(project).values(), key=len, reverse=True):
                if len(secret) >= 4:
                    value = value.replace(secret, '[redacted]')
        for secret in sorted(self.secret_values, key=len, reverse=True):
            value = value.replace(secret, '[redacted]')
        return re.sub(r'\d{5,}:[A-Za-z0-9_-]{20,}', '[bot token redacted]', value)

    def log(self, project: dict, data: str):
        path = self.folder(project) / 'runtime.log'
        content = self.redact(data, project).encode('utf-8', errors='replace')[-LOG_LIMIT:]
        with self.log_lock:
            if path.exists() and path.stat().st_size + len(content) > LOG_LIMIT:
                path.replace(path.with_suffix('.previous.log'))
            with path.open('ab') as output:
                output.write(content)

    def reader(self, process, project):
        # Bounded chunks even when a program never writes a newline.
        pending = b''
        try:
            while chunk := process.stdout.read(4096):
                pending += chunk
                while b'\n' in pending:
                    line, pending = pending.split(b'\n', 1)
                    self.log(project, line.decode('utf-8', errors='replace') + '\n')
                if len(pending) >= 8192:
                    self.log(project, '[long log line omitted]\n')
                    pending = b''
            if pending:
                self.log(project, pending.decode('utf-8', errors='replace') + '\n')
        except (OSError, ProjectError):
            pass
        finally:
            process.stdout.close()

    def disk_size(self) -> int:
        return sum(p.stat().st_size for p in self.projects.root.rglob('*') if p.is_file() and not p.is_symlink())

    def guard(self):
        if self.disk_size() >= self.disk_limit or shutil.disk_usage(self.projects.root).free < 32 * MB:
            raise ProjectError('Hosting disk budget is full. Stop projects and remove unused files.')
        try:
            limit = Path('/sys/fs/cgroup/memory.max').read_text().strip()
            used = int(Path('/sys/fs/cgroup/memory.current').read_text())
            if limit.isdigit() and int(limit) - used < 48 * MB:
                raise ProjectError('Not enough deployment memory headroom. Stop another project first.')
        except (OSError, ValueError):
            pass
        if sum(group_memory(p['process'].pid) for p in self.running.values()) >= self.memory_limit:
            raise ProjectError('Running projects reached the shared memory budget.')

    def update(self, project: dict, **values):
        project = {**self.projects.get(project['id']), **values}
        self.projects.write(project, self.folder(project))
        return project

    def check(self):
        if sys.platform != 'linux' or not self.boot:
            raise ProjectError('The single-deployment runner requires Linux with /proc.')
        self.guard()
        # Reap only processes with this saved random run marker, never an arbitrary reused PID.
        for project in self.projects.list():
            record = self.folder(project) / 'process.json'
            if record.exists():
                info = json.loads(record.read_text())
                if info.get('boot') == self.boot:
                    for item in Path('/proc').iterdir():
                        if not item.name.isdigit():
                            continue
                        row = proc(int(item.name))
                        if row and row[0] == info['pid'] and row[1] >= info['ticks']:
                            with contextlib.suppress(OSError):
                                env = (item / 'environ').read_bytes().split(b'\x00')
                                if ('K9_PROJECT_RUN_ID=' + info['marker']).encode() in env:
                                    os.killpg(info['pid'], signal.SIGKILL)
                                    break
                record.unlink(missing_ok=True)

    def start_supervisor(self):
        self.thread = threading.Thread(target=self.supervise, daemon=True)
        self.thread.start()

    def supervise(self):
        while not self.done.wait(1):
            try:
                self.tick()
            except (OSError, ValueError, ProjectError):
                # An individual corrupt project must not kill supervision of healthy bots.
                continue

    def tick(self):
        with self.lock:
            for pid, record in list(self.running.items()):
                child = record['process']
                if child.poll() is not None:
                    self.terminate(pid)
                    project = self.projects.get(pid)
                    self.log(project, f'Runner: process exited with code {child.returncode}.\n')
                    count, _ = self.retry.get(pid, (0, 0))
                    if time.monotonic() - record['started'] > 300:
                        count = 0
                    self.retry[pid] = (count + 1, time.monotonic() + min(60, 5 * 2 ** count))
                    if count >= 2:
                        self.update(project, local_desired=False, local_error='Repeated exits; check Logs, then Start.')
            try:
                self.guard()
            except ProjectError as exc:
                for pid in list(self.running):
                    self.update(self.projects.get(pid), local_desired=False, local_error=str(exc))
                    self.terminate(pid)
                return
            for project in self.projects.list():
                if project.get('local_desired') and project['id'] not in self.running:
                    if len(self.running) >= self.max_running:
                        break
                    if self.retry.get(project['id'], (0, 0))[1] > time.monotonic():
                        continue
                    try:
                        self.launch(project)
                    except ProjectError as exc:
                        self.update(project, local_desired=False, local_error=str(exc))

    def spawn(self, project: dict, command: list[str], cwd: Path):
        self.guard()
        marker = uuid.uuid4().hex
        env = self.environment(project)
        env['K9_PROJECT_RUN_ID'] = marker
        process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('child.py')),
                                    str(os.getpid()), *command], cwd=cwd, env=env,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True, bufsize=0)
        row = proc(process.pid)
        if row:
            pending = self.folder(project) / 'process.tmp'
            pending.write_text(json.dumps({'pid': process.pid, 'ticks': row[1], 'boot': self.boot, 'marker': marker}))
            pending.replace(self.folder(project) / 'process.json')
        reader = threading.Thread(target=self.reader, args=(process, project), daemon=True)
        reader.start()
        self.running[project['id']] = {'process': process, 'reader': reader, 'started': time.monotonic(),
                                       'token_hash': self.token_hash(env)}
        return process

    @staticmethod
    def token_hash(env: dict) -> str | None:
        token = env.get('BOT_TOKEN')
        return hashlib.sha256(token.encode()).hexdigest() if token else None

    def terminate(self, pid: str):
        record = self.running.pop(pid, None)
        if not record:
            return
        child = record['process']
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=3)
        # Reader may be finishing a redacted final line; do not join while holding its log lock.
        (self.projects.apps / pid / 'process.json').unlink(missing_ok=True)

    def install(self, project: dict, command: list[str], cwd: Path):
        child = self.spawn(project, command, cwd)
        deadline = time.monotonic() + 180
        try:
            while child.poll() is None:
                if time.monotonic() >= deadline:
                    raise ProjectError('Dependency setup timed out. Check Logs and simplify requirements.')
                self.guard()
                time.sleep(0.2)
            if child.returncode:
                raise ProjectError('Dependency setup failed. Check Logs before retrying Prepare runtime.')
        finally:
            self.terminate(project['id'])

    def prepare(self, project: dict) -> str:
        if self.running:
            raise ProjectError('Stop running projects before preparing dependencies on this small deployment.')
        if not project.get('entry'):
            raise ProjectError('Choose the startup file first.')
        project = self.update(project, local_prepared=False, local_desired=False, local_error='')
        source = self.folder(project) / 'source'
        entry = Path(project['entry'])
        folder = self.folder(project)
        self.environment(project)  # Validate settings before starting any dependency code.
        manifest = 'requirements.txt' if entry.suffix.lower() == '.py' else 'package.json'
        package_dir = source / entry.parent if (source / entry.parent / manifest).exists() else source
        if entry.suffix.lower() == '.py':
            target = folder / 'venv'
            self.install(project, [sys.executable, '-m', 'venv', '--without-pip', str(target)], source)
            python = str(target / 'bin/python')
            if (package_dir / manifest).is_file():
                self.install(project, [python, '-m', 'ensurepip'], source)
                self.install(project, [python, '-m', 'pip', 'install', '--no-cache-dir', '--no-compile',
                                      '--disable-pip-version-check', '-r', str(package_dir / manifest)], package_dir)
        else:
            if not shutil.which('node'):
                raise ProjectError('Node.js is not installed in this deployment. Use a Python project or a runtime image with Node.js.')
            if (package_dir / manifest).is_file():
                npm = shutil.which('npm')
                if not npm:
                    raise ProjectError('npm is not installed in this deployment.')
                self.install(project, [npm, 'ci' if (package_dir / 'package-lock.json').exists() else 'install',
                                      '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], package_dir)
        example = self.projects.secrets / (project['id'] + '.env.example')
        if not example.exists():
            example.write_text('# Copy to the same filename without .example. Add this project\'s own secrets.\n# BOT_TOKEN=\n')
        self.update(project, local_prepared=True, local_desired=False, local_error='')
        return 'Runtime prepared. Add this bot\'s token as panel Secret K9_PROJECT_' + project['id'].upper() + '_BOT_TOKEN, then Start. Other settings use the same prefix.'

    def launch(self, project: dict):
        if not project.get('local_prepared'):
            raise ProjectError('Prepare this project runtime before starting it.')
        if len(self.running) >= self.max_running:
            raise ProjectError('The concurrent project limit is full. Stop another project first.')
        token = self.token_hash(self.environment(project))
        if token and any(p['token_hash'] == token for p in self.running.values()):
            raise ProjectError('Another running project already uses this bot token. Stop it first.')
        source = self.folder(project) / 'source'
        entry = Path(project['entry'])
        command = [str(self.folder(project) / 'venv/bin/python'), '-u'] if entry.suffix.lower() == '.py' else [shutil.which('node') or 'node']
        self.spawn(project, [*command, './' + entry.name], source / entry.parent)
        self.update(project, local_error='')

    def state(self, project: dict) -> str:
        with self.lock:
            record = self.running.get(project['id'])
            if record and record['process'].poll() is None:
                return f'running · {group_memory(record["process"].pid) / MB:.0f} MB'
            saved = self.projects.get(project['id'])
            return saved.get('local_error') or ('waiting to restart' if saved.get('local_desired') else
                   'stopped' if saved.get('local_prepared') else 'prepare runtime first')

    def action(self, project: dict, action: str) -> str:
        with self.lock:
            project = self.projects.get(project['id'])
            if action == 'logs':
                path = self.folder(project) / 'runtime.log'
                if not path.exists():
                    return 'No runtime logs yet.'
                with path.open('rb') as src:
                    src.seek(max(0, path.stat().st_size - 6000))
                    return self.redact(src.read().decode('utf-8', errors='replace'), project)[-3000:]
            if action == 'stage':
                self.retry.pop(project['id'], None)
                return self.prepare(project)
            if action in {'stop', 'delete', 'restart'}:
                project = self.update(project, local_desired=False, local_error='')
                self.terminate(project['id'])
                self.retry.pop(project['id'], None)
            if action == 'delete':
                self.env_file(project).unlink(missing_ok=True)
                self.projects.secrets.joinpath(project['id'] + '.env.example').unlink(missing_ok=True)
                shutil.rmtree(self.folder(project))
                return 'Project deleted.'
            if action == 'stop':
                return 'Project stopped.'
            if project['id'] not in self.running:
                self.retry.pop(project['id'], None)
                self.launch(project)
            self.update(project, local_desired=True)
            return 'Runner status: ' + self.state(project)

    def close(self):
        self.done.set()
        if self.thread:
            self.thread.join(timeout=3)
        with self.lock:
            for pid in list(self.running):
                self.terminate(pid)
