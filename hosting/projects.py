"""Project artifact handling and the Docker runtime for the VPS worker."""
from __future__ import annotations

import contextlib
import json
import re
import shutil
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

MAX_UPLOAD = 20 * 1024 * 1024
MAX_EXPANDED = 60 * 1024 * 1024
MAX_PROJECTS = 20
RUNTIMES = {'.py': 'python', '.js': 'node'}
ENTRY_PRIORITY = {'bot.py': 1, 'main.py': 2, 'app.py': 3, 'run.py': 4,
                  'index.js': 1, 'bot.js': 2, 'main.js': 3, 'app.js': 4}
SKIP_PARTS = {'__macosx', '.venv', 'venv', 'node_modules', '__pycache__', 'tests', 'test', '.git'}


class ProjectError(Exception):
    pass


def safe_path(value: str) -> PurePosixPath:
    value = value.replace('\\', '/')
    path = PurePosixPath(value)
    if (path.is_absolute() or not path.parts or '..' in path.parts or ':' in value
            or any(ord(c) < 32 for c in value) or len(value) > 512 or len(path.parts) > 20):
        raise ProjectError('The upload contains an unsafe file path.')
    return path


def extract_zip(source: Path, target: Path) -> None:
    # Adapted from K9 Hosting's artifact validation, with a fresh staging directory.
    try:
        with zipfile.ZipFile(source) as archive:
            members = archive.infolist()
            if len(members) > 500 or sum(item.file_size for item in members) > MAX_EXPANDED:
                raise ProjectError('ZIP exceeds the 500-file or 60 MB unpacked limit.')
            seen = set()
            for item in members:
                path = safe_path(item.filename)
                kind = stat.S_IFMT(item.external_attr >> 16)
                if path in seen or kind not in (0, stat.S_IFDIR, stat.S_IFREG):
                    raise ProjectError('ZIP contains duplicate paths or special files.')
                seen.add(path)
                dest = target.joinpath(*path.parts)
                if item.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(item) as src, dest.open('xb') as output:
                        shutil.copyfileobj(src, output)
    except (OSError, RuntimeError, NotImplementedError, zipfile.BadZipFile):
        raise ProjectError('Could not unpack this ZIP. Check its contents and try again.') from None


def entrypoints(source: Path) -> list[str]:
    files = []
    for path in source.rglob('*'):
        relative = path.relative_to(source)
        if (path.is_file() and path.suffix.lower() in RUNTIMES
                and not SKIP_PARTS.intersection(part.lower() for part in relative.parts)
                and path.name.lower() not in {'setup.py', 'conftest.py', 'test.py'}):
            files.append(relative.as_posix())
    return sorted(files, key=lambda name: (ENTRY_PRIORITY.get(Path(name).name.lower(), 10),
                                           name.count('/'), name))


class Projects:
    def __init__(self, root: Path):
        self.root = root
        self.apps = root / 'projects'
        self.apps.mkdir(mode=0o700, exist_ok=True)
        self.secrets = root / 'project-env'
        self.secrets.mkdir(mode=0o700, exist_ok=True)

    def list(self) -> list[dict]:
        return [self.get(p.name) for p in sorted(self.apps.iterdir()) if re.fullmatch(r'[0-9a-f]{16}', p.name)]

    def get(self, project_id: str) -> dict:
        if not re.fullmatch(r'[0-9a-f]{16}', project_id):
            raise ProjectError('Invalid project.')
        try:
            return json.loads((self.apps / project_id / 'project.json').read_text())
        except FileNotFoundError:
            raise ProjectError('This project no longer exists.') from None

    def write(self, project: dict, folder: Path) -> None:
        pending = folder / 'project.tmp'
        pending.write_text(json.dumps(project, ensure_ascii=False))
        pending.replace(folder / 'project.json')

    def upload(self, project_id: str, name: str, source: Path) -> dict:
        if (self.apps / project_id).exists():
            return self.get(project_id)
        if len(self.list()) >= MAX_PROJECTS:
            raise ProjectError(f'This host already has {MAX_PROJECTS} saved projects.')
        path = safe_path(name)
        if len(path.parts) != 1 or path.suffix.lower() not in {*RUNTIMES, '.zip'}:
            raise ProjectError('Upload a .py, .js or .zip document.')
        with tempfile.TemporaryDirectory(dir=self.apps) as tmp:
            folder = Path(tmp) / 'new'
            code = folder / 'source'
            code.mkdir(parents=True)
            if path.suffix.lower() == '.zip':
                extract_zip(source, code)
            else:
                shutil.copyfile(source, code / path.name)
            choices = entrypoints(code) if path.suffix.lower() == '.zip' else [path.name]
            if not choices:
                raise ProjectError('No Python .py or Node.js .js entrypoint was found.')
            project = {'id': project_id, 'name': path.stem[:64], 'choices': choices,
                       'entry': choices[0] if len(choices) == 1 else None}
            self.write(project, folder)
            folder.rename(self.apps / project_id)
        return project

    def select(self, project: dict, index: int) -> dict:
        if project['entry']:
            return project
        if not 0 <= index < len(project['choices']):
            raise ProjectError('This entrypoint is unavailable.')
        project['entry'] = project['choices'][index]
        self.write(project, self.apps / project['id'])
        return project


class Docker:
    label = 'Docker'

    def check(self) -> None:
        self.cli('info', '--format', '{{.ServerVersion}}')

    def __init__(self, projects: Projects):
        self.projects = projects

    @staticmethod
    def cli(*args: str, timeout: int = 45, stdin: str | None = None,
            allow_failure: bool = False) -> str | None:
        try:
            result = subprocess.run(['docker', *args], input=stdin, capture_output=True,
                                    text=True, errors='replace', timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise ProjectError('Docker is unavailable or the operation timed out.') from None
        if result.returncode:
            if allow_failure and re.search(r'No such (container|object|image|volume)', result.stderr, re.I):
                return None
            # Build output may contain private URLs and is kept out of Telegram.
            raise ProjectError(f'Docker {args[0]} failed. Check the VPS Docker service or project dependencies.')
        return (result.stdout + result.stderr if args[0] == 'logs' else result.stdout).strip()

    @staticmethod
    def name(project: dict) -> str:
        return 'k9-service-' + project['id']

    def state(self, project: dict) -> str:
        return self.cli('container', 'inspect', '--format', '{{.State.Status}}', self.name(project),
                        allow_failure=True) or 'not started'

    def build(self, project: dict) -> None:
        source = self.projects.apps / project['id'] / 'source'
        entry = Path(project['entry'])
        parent = entry.parent
        runtime = RUNTIMES[entry.suffix.lower()]
        dependency = 'requirements.txt' if runtime == 'python' else 'package.json'
        package_dir = parent if (source / parent / dependency).is_file() else Path('.')
        manifest = package_dir / dependency
        image = 'python:3.12-slim' if runtime == 'python' else 'node:22-slim'
        dockerfile = f'FROM {image}\nWORKDIR /app\nCOPY . .\n'
        if (source / manifest).is_file():
            if runtime == 'python':
                dockerfile += 'RUN ' + json.dumps(['python', '-m', 'pip', 'install', '--no-cache-dir',
                                                   '-r', './' + manifest.as_posix()]) + '\n'
            else:
                install = 'ci' if (source / package_dir / 'package-lock.json').is_file() else 'install'
                dockerfile += 'RUN ' + json.dumps(['npm', '--prefix', package_dir.as_posix(), install,
                                                    '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund']) + '\n'
        dockerfile += 'RUN chown -R 1000:1000 /app && chmod -R u+rwX /app\nUSER 1000:1000\n'
        self.cli('build', '-t', self.name(project), '-f', '-', str(source),
                 timeout=240, stdin=dockerfile)

    def action(self, project: dict, action: str) -> str:
        name = self.name(project)
        state = self.state(project)
        if action == 'logs':
            if state == 'not started':
                return 'No runtime logs yet.'
            return self.redact(self.cli('logs', '--tail', '30', name) or '', project)
        if action == 'delete':
            if state != 'not started':
                self.cli('rm', '-f', name)
            self.cli('volume', 'rm', name, allow_failure=True)
            self.cli('image', 'rm', name, allow_failure=True)
            (self.projects.secrets / (project['id'] + '.env')).unlink(missing_ok=True)
            shutil.rmtree(self.projects.apps / project['id'])
            return 'Project deleted.'
        if action == 'stop':
            if state not in {'not started', 'exited', 'created'}:
                self.cli('stop', '-t', '10', name)
            return 'Project stopped.'
        if not project['entry']:
            raise ProjectError('Choose a startup file first.')
        if state != 'not started' and action == 'restart':
            if state not in {'created', 'exited'}:
                self.cli('stop', '-t', '10', name)
            self.cli('rm', name)
            state = 'not started'
        if state == 'not started':
            if self.cli('image', 'inspect', '--format', '{{.Id}}', name, allow_failure=True) is None:
                self.build(project)
            self.create(project, name)
        if state != 'running':
            self.cli('start', name)
        return 'Docker status: ' + self.state(project)

    def create(self, project: dict, name: str) -> None:
        entry = Path(project['entry'])
        runtime = RUNTIMES[entry.suffix.lower()]
        command = ['python', '-u'] if runtime == 'python' else ['node']
        env_file = self.projects.secrets / (project['id'] + '.env')
        env_args = ['--env-file', str(env_file)] if env_file.is_file() else []
        self.cli('create', '--name', name, '--restart', 'unless-stopped', '--init',
                 '--read-only', '--user', '1000:1000', '--cap-drop', 'ALL',
                 '--security-opt', 'no-new-privileges:true', '--pids-limit', '128',
                 '--memory', '512m', '--memory-swap', '512m', '--cpus', '0.5',
                 '--log-driver', 'local', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2',
                 '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m', '--env', 'HOME=/tmp',
                 '--env', 'PYTHONDONTWRITEBYTECODE=1', '--mount', f'type=volume,src={name},dst=/app',
                 '--workdir', '/app/' + entry.parent.as_posix(), *env_args,
                 name, *command, './' + entry.name)

    def redact(self, text: str, project: dict) -> str:
        env_file = self.projects.secrets / (project['id'] + '.env')
        if env_file.is_file():
            with contextlib.suppress(OSError):
                for line in env_file.read_text().splitlines():
                    _, _, value = line.partition('=')
                    if value:
                        text = text.replace(value, '[redacted]')
        text = re.sub(r'\d{5,}:[A-Za-z0-9_-]{20,}', '[bot token redacted]', text)
        return text[-3000:] or 'No runtime logs yet.'
