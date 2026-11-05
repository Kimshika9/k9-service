"""Bot-Hosting.net runtime for a dedicated, separately provisioned deployment."""
from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .projects import ProjectError, Projects

API = 'https://bot-hosting.net/api/v1'
RUNTIMES = {'.py': 'python', '.js': 'nodejs'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class BotHosting:
    label = 'Bot-Hosting.net'

    def __init__(self, projects: Projects):
        self.projects = projects
        self.key = os.environ.get('BOT_HOSTING_API_KEY', '')
        self.worker = os.environ.get('BOT_HOSTING_WORKER_ID', '')
        self.child = os.environ.get('BOT_HOSTING_CHILD_ID', '')
        if (not self.key.startswith('bhk_') or not self.valid_id(self.worker)
                or not self.valid_id(self.child) or self.worker == self.child):
            raise ProjectError('Set a Bot-Hosting API key and separate worker and child deployment IDs.')
        self.http = build_opener(NoRedirect())
        self.path = '/deployments/' + self.child

    @staticmethod
    def valid_id(value: str) -> bool:
        return bool(re.fullmatch(r'[A-Za-z0-9_-]{5,80}', value))

    def call(self, method: str, path: str, body=None, *, missing_ok: bool = False) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = Request(API + path, data=data, method=method, headers={
            'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json',
            'Accept': 'application/json',
        })
        try:
            with self.http.open(request, timeout=55) as response:
                return json.loads(response.read(2 * 1024 * 1024))
        except HTTPError as exc:
            if missing_ok and exc.code == 404:
                return {}
            raise ProjectError(f'Bot-Hosting returned HTTP {exc.code}. Check the child deployment and API permissions.') from None
        except (URLError, OSError, ValueError):
            raise ProjectError('Bot-Hosting did not return a usable response. Check the panel and retry.') from None

    def check(self) -> dict:
        app = self.call('GET', self.path)
        if (app.get('owned') is not True or app.get('name') != 'k9-hosted-child'
                or app.get('runtime') not in RUNTIMES.values()):
            raise ProjectError('Set the child ID to your dedicated k9-hosted-child Python or Node.js deployment.')
        return app

    def state(self, project: dict) -> str:
        if not project.get('managed_id'):
            return 'ready to stage'
        self.check_binding(project)
        app = self.call('GET', self.path, missing_ok=True)
        return str(app.get('state', 'deployment missing'))

    def check_binding(self, project: dict) -> None:
        if project.get('managed_id') != self.child:
            raise ProjectError('The selected child deployment differs from the one assigned to this project.')

    def archive_upload(self, source: Path, prefix: str) -> str:
        upload = self.call('POST', self.path + '/files/upload-url', {'path': '/'})
        url = upload.get('url', '')
        parsed = urlsplit(url)
        host = parsed.hostname or ''
        domain_ok = any(host == domain or host.endswith('.' + domain)
                        for domain in ('bot-hosting.net', 'bot-hosting.cloud'))
        field = upload.get('field') or 'files'
        if (parsed.scheme != 'https' or not domain_ok or parsed.username or parsed.password
                or not re.fullmatch(r'[A-Za-z0-9_\[\]-]{1,40}', field)):
            raise ProjectError('Bot-Hosting returned an unexpected upload target.')
        name = prefix + '.zip'
        boundary = uuid.uuid4().hex
        with tempfile.TemporaryFile() as bundle:
            with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
                for item in sorted(source.rglob('*')):
                    if item.is_file():
                        archive.write(item, prefix + '/' + item.relative_to(source).as_posix())
            bundle.seek(0)
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\n'
                    'Content-Type: application/zip\r\n\r\n').encode() + bundle.read() + f'\r\n--{boundary}--\r\n'.encode()
        try:
            req = Request(url, data=body, headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
            with self.http.open(req, timeout=90):
                pass
        except (URLError, OSError):
            raise ProjectError('Bot-Hosting could not upload the staged archive. Retry from the project card.') from None
        return name

    def stage(self, project: dict) -> str:
        if not project['entry']:
            raise ProjectError('Choose a startup file first.')
        if project.get('managed_id'):
            self.check_binding(project)
            if project.get('managed_staged'):
                return 'Project is already staged.'
        app = self.check()
        expected_runtime = RUNTIMES[Path(project['entry']).suffix.lower()]
        if app.get('runtime') != expected_runtime:
            raise ProjectError(f'This entry requires a {expected_runtime} child deployment. Select that runtime in the panel.')
        if app.get('state') not in {'offline', 'stopped', 'exited'}:
            raise ProjectError('Stop the dedicated child deployment in the panel before staging files.')
        prefix = 'k9-project-' + project['id']
        folder = self.projects.apps / project['id']
        source = folder / 'source'
        entry = Path(project['entry'])
        project['managed_id'] = self.child
        self.projects.write(project, folder)
        archive = self.archive_upload(source, prefix)
        self.call('POST', self.path + '/files/decompress', {'root': '/', 'file': archive, 'removeArchive': True})
        working = prefix + ('/' + entry.parent.as_posix() if entry.parent != Path('.') else '')
        run = 'python -u' if expected_runtime == 'python' else 'node'
        commands = ['cd ' + shlex.quote(working)]
        package = 'requirements.txt' if expected_runtime == 'python' else 'package.json'
        if (source / entry.parent / package).is_file() or (source / package).is_file():
            path = package if (source / entry.parent / package).is_file() else '../' * len(entry.parent.parts) + package
            if expected_runtime == 'python':
                commands.append('python -m pip install --disable-pip-version-check -r ' + shlex.quote('./' + path))
            else:
                npm_prefix = str(Path(path).parent)
                lock = source / (entry.parent if path == package else Path('.')) / 'package-lock.json'
                commands.append('npm --prefix ' + shlex.quote(npm_prefix) + (' ci' if lock.is_file() else ' install')
                                + ' --omit=dev --ignore-scripts --no-audit --no-fund')
        commands.append('exec ' + run + ' ' + shlex.quote('./' + entry.name))
        self.call('PATCH', self.path + '/startup', {'entryFile': prefix + '/' + entry.as_posix(),
                                                    'startCommand': ' && '.join(commands)})
        project['managed_staged'] = True
        self.projects.write(project, folder)
        return 'Staged. Set this bot’s secrets in the child deployment Environment, then press Start.'

    def action(self, project: dict, action: str) -> str:
        if action == 'stage':
            return self.stage(project)
        if action == 'delete':
            if project.get('managed_id'):
                self.check_binding(project)
                current = self.call('GET', self.path, missing_ok=True)
                if current:
                    if current.get('name') != 'k9-hosted-child' or current.get('owned') is not True:
                        raise ProjectError('The designated child deployment could not be verified for deletion.')
                    self.call('DELETE', self.path, missing_ok=True)
            shutil.rmtree(self.projects.apps / project['id'])
            return 'Project deleted.'
        if not project.get('managed_staged'):
            raise ProjectError('Stage this project before starting it.')
        self.check_binding(project)
        if action == 'logs':
            result = self.call('GET', self.path + '/logs?size=30')
            raw = '\n'.join(str(line) for line in result.get('lines', []))
            safe = raw.replace(self.key, '[redacted]')
            safe = re.sub(r'\d{5,}:[A-Za-z0-9_-]{20,}', '[bot token redacted]', safe)
            return safe[-3000:] or 'No runtime logs yet.'
        result = self.call('POST', self.path + '/power', {'action': action, 'waitSeconds': 15})
        return 'Bot-Hosting status: ' + str(result.get('state', 'unknown'))
