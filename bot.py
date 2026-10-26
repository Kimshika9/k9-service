#!/usr/bin/env python3
"""K9 Service connector. Python 3.10+, standard library only (Pydroid/Termux).

python bot.py             first-time setup, then connect the Cloudflare webhook
python bot.py --setup     edit local settings and write CLOUDFLARE-SECRETS.txt
python bot.py --check     validate local settings without a network request
python bot.py --status    check the website and Telegram webhook
python bot.py --connect   configure webhook, commands and Mini App menu
python bot.py --poll      optional phone polling bridge; keep this process running

The Cloudflare Worker owns orders, receipts, Rich Messages and owner permissions.
Default webhook mode keeps working when this phone is off.
"""
from __future__ import annotations
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CONFIG_FILE = ROOT / '.k9-service-config.json'
SECRETS_FILE = ROOT / 'CLOUDFLARE-SECRETS.txt'
OFFSET_FILE = ROOT / '.k9-service-offset'
FIELDS = ('BOT_TOKEN', 'BOT_USERNAME', 'OWNER_TELEGRAM_ID', 'TELEGRAM_WEBHOOK_SECRET', 'SITE_URL')
VERSION = '1.1'
COMMANDS = [
    {'command': 'start', 'description': 'Open K9 Service'},
    {'command': 'services', 'description': 'Browse available services'},
    {'command': 'order', 'description': 'Place a direct order'},
    {'command': 'orders', 'description': 'View my orders'},
    {'command': 'id', 'description': 'Show my Telegram user ID'},
    {'command': 'cancel', 'description': 'Cancel the current draft'},
]

class ConnectionError(Exception):
    def __init__(self, message: str, code: int = 0, retry_after: int = 0):
        super().__init__(message)
        self.code = code
        self.retry_after = retry_after


def site_url(value: str) -> str:
    value = value.strip().rstrip('/')
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path:
            raise ValueError
    except ValueError:
        raise ConnectionError('SITE_URL must be the base HTTPS website URL, without /owner, a query or a fragment.') from None
    return value


def validate(config: dict) -> dict:
    c = {k: str(config.get(k, '')).strip() for k in FIELDS}
    if not re.fullmatch(r'\d{5,}:[A-Za-z0-9_-]{20,}', c['BOT_TOKEN']):
        raise ConnectionError('Enter a valid BOT_TOKEN from BotFather. Do not post it in chat or GitHub.')
    if not re.fullmatch(r'[1-9]\d{0,15}', c['OWNER_TELEGRAM_ID']):
        raise ConnectionError('OWNER_TELEGRAM_ID must be your numeric Telegram user ID, not @username.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', c['TELEGRAM_WEBHOOK_SECRET']):
        raise ConnectionError('TELEGRAM_WEBHOOK_SECRET must contain 32–256 letters, digits, _ or -.')
    c['SITE_URL'] = site_url(c['SITE_URL'])
    c['BOT_USERNAME'] = c['BOT_USERNAME'].lstrip('@')
    return c


def load_config() -> dict:
    saved = {}
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            raise ConnectionError('Local configuration cannot be read. Run python bot.py --setup.') from None
    for k in FIELDS:
        if os.getenv(k):
            saved[k] = os.environ[k]
    return saved


def private_write(path: Path, data: str) -> None:
    temporary = path.with_name(path.name + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(data)
    os.replace(temporary, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def request_label(url: str) -> str:
    """Describe the step without exposing Telegram's token-bearing URL."""
    parsed = urlsplit(url)
    if parsed.hostname == 'api.telegram.org':
        method = parsed.path.rsplit('/', 1)[-1]
        return 'Telegram ' + (method if re.fullmatch(r'[A-Za-z]+', method) else 'API')
    return 'K9 website API'


def safe_message(value, url: str, headers=None) -> str:
    message = str(value)
    for secret in [url, *(headers or {}).values()]:
        if secret:
            message = message.replace(str(secret), '[redacted]')
    message = re.sub(r'\d{5,}:[A-Za-z0-9_-]{20,}', '[bot token redacted]', message)
    return ' '.join(message.split())[:500]


def http_failure(url: str, status: int, body: bytes, response_headers, request_headers=None) -> ConnectionError:
    label = request_label(url)
    try:
        details = json.loads(body)
        if not isinstance(details, dict):
            details = {}
    except (ValueError, UnicodeError):
        details = {}
    description = details.get('description') or details.get('error')
    message = f'{label}: HTTP {status}.'
    if description:
        message += ' ' + safe_message(description, url, request_headers)
    elif status == 403:
        message += ' The server refused this request; this does not mean your internet is slow.'
    if status == 403 and label.startswith('Telegram'):
        message += ' Telegram/API access was denied. This is not a Cloudflare settings check.'
    elif status == 403:
        cloudflare = response_headers.get('cf-ray') or b'cloudflare' in body.lower()
        if cloudflare:
            message += ' Cloudflare is in the response path. Check the matching Security event and any Access policy; this alone does not prove which rule blocked it.'
        else:
            message += ' Check that SITE_URL is your deployed public K9 Worker, not a dashboard or private preview URL.'
    elif status == 401 and not label.startswith('Telegram'):
        message += ' Check that TELEGRAM_WEBHOOK_SECRET matches Cloudflare.'
    ray = response_headers.get('cf-ray', '')
    if re.fullmatch(r'[A-Za-z0-9-]{1,100}', ray):
        message += ' Cloudflare Ray ID: ' + ray + '.'
    try:
        retry_after = int((details.get('parameters') or {}).get('retry_after', 0))
    except (ValueError, TypeError, AttributeError):
        retry_after = 0
    return ConnectionError(message, status, retry_after)


def request_json(url: str, payload=None, headers=None, timeout=35):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    h = {'Accept': 'application/json', 'User-Agent': 'K9-Service-Connector/' + VERSION, **(headers or {})}
    if data is not None:
        h['Content-Type'] = 'application/json'
    req = Request(url, data=data, headers=h, method='GET' if data is None else 'POST')
    try:
        with urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        # Inspect a bounded body, but never print raw HTML or token-bearing URLs.
        try:
            body = error.read(65536)
        except OSError:
            body = b''
        raise http_failure(url, error.code, body, error.headers or {}, headers) from None
    except (URLError, TimeoutError, OSError):
        raise ConnectionError(request_label(url) + ': no usable network response (connection, DNS or TLS failure).') from None
    except ValueError:
        raise ConnectionError(request_label(url) + ': expected JSON but received another response. Check SITE_URL, the latest Worker deployment and any login/Access page.') from None


def telegram(c: dict, method: str, payload=None, timeout=35):
    result = request_json(f"https://api.telegram.org/bot{c['BOT_TOKEN']}/{method}", payload or {}, timeout=timeout)
    if not result.get('ok'):
        raise ConnectionError(str(result.get('description', 'Telegram request failed.')), int(result.get('error_code', 0)), int(result.get('parameters', {}).get('retry_after', 0)))
    return result['result']


def setup(saved: dict) -> dict:
    print('\nK9 SERVICE — CONNECTION SETUP')
    print('Enter these values locally. The bot token is not printed to the console.')
    c = dict(saved)
    token = getpass.getpass('Bot token (blank keeps saved token): ').strip()
    if token:
        c['BOT_TOKEN'] = token
    for k, label in [('SITE_URL', 'Base HTTPS website URL'), ('OWNER_TELEGRAM_ID', 'Your numeric Telegram user ID')]:
        value = input(f"{label} [{c.get(k, '')}]: ").strip()
        if value:
            c[k] = value
    c['TELEGRAM_WEBHOOK_SECRET'] = c.get('TELEGRAM_WEBHOOK_SECRET') or secrets.token_urlsafe(32)
    c = validate(c)
    print('Checking Telegram bot identity (getMe)...', flush=True)
    me = telegram(c, 'getMe')
    c['BOT_USERNAME'] = me['username']
    private_write(CONFIG_FILE, json.dumps(c, indent=2) + '\n')
    # This private local file is intentionally excluded by .gitignore.
    content = 'K9 SERVICE — PRIVATE CLOUDFLARE SETTINGS\nDO NOT UPLOAD OR SHARE THIS FILE.\n\n'
    content += 'Cloudflare → Workers & Pages → k9-service → Settings → Variables and Secrets\nAdd each value as a Secret, then deploy/reopen the Mini App.\n\n'
    content += '\n'.join(k + '=' + c[k] for k in FIELDS) + '\n'
    private_write(SECRETS_FILE, content)
    print(f"Bot identified: @{c['BOT_USERNAME']}")
    print('Saved .k9-service-config.json and CLOUDFLARE-SECRETS.txt on this device.')
    print('Copy the values from the private settings file into Cloudflare Variables and Secrets.')
    return c


def website_check(c: dict, me: dict) -> dict:
    print('Checking K9 website public status...', flush=True)
    health = request_json(c['SITE_URL'] + '/api/connection/status')
    if health.get('service') != 'k9-service':
        raise ConnectionError('This URL is not the updated K9 Service backend.')
    missing = health.get('missing') or []
    if missing:
        raise ConnectionError('Cloudflare settings are missing: ' + ', '.join(missing) + '. Copy them from CLOUDFLARE-SECRETS.txt, then deploy.')
    if not health.get('tokenValid'):
        raise ConnectionError('Cloudflare BOT_TOKEN is invalid or Telegram is unreachable. Use the same token as this script.')
    if (health.get('bot') or {}).get('id') != me['id']:
        raise ConnectionError('This website and bot.py use different bot tokens. Set the same BOT_TOKEN in both.')
    print('Verifying K9 website connection settings...', flush=True)
    result = request_json(c['SITE_URL'] + '/api/connection/status', {'ownerId': c['OWNER_TELEGRAM_ID'], 'botId': me['id'], 'siteUrl': c['SITE_URL']}, {'x-k9-connection-secret': c['TELEGRAM_WEBHOOK_SECRET']})
    if not result.get('ok'):
        raise ConnectionError('Website connection verification failed.')
    return health


def configure_menu(c: dict):
    telegram(c, 'setMyCommands', {'commands': COMMANDS})
    telegram(c, 'setChatMenuButton', {'menu_button': {'type': 'web_app', 'text': 'Open K9 Service', 'web_app': {'url': c['SITE_URL']}}})
    try:
        telegram(c, 'setChatMenuButton', {'chat_id': int(c['OWNER_TELEGRAM_ID']), 'menu_button': {'type': 'web_app', 'text': 'Owner dashboard', 'web_app': {'url': c['SITE_URL'] + '/owner'}}})
    except ConnectionError:
        print('Owner-specific menu is pending. Press Start in the bot from your owner account, then reconnect.')


def connect(c: dict):
    print('Checking Telegram bot identity (getMe)...', flush=True)
    me = telegram(c, 'getMe')
    website_check(c, me)
    configure_menu(c)
    target = c['SITE_URL'] + '/api/telegram/webhook'
    telegram(c, 'setWebhook', {'url': target, 'secret_token': c['TELEGRAM_WEBHOOK_SECRET'], 'allowed_updates': ['message', 'callback_query'], 'drop_pending_updates': False})
    info = telegram(c, 'getWebhookInfo')
    if info.get('url') != target:
        raise ConnectionError('Telegram did not retain the expected webhook URL.')
    print(f"\nConnected @{me['username']} to K9 Service.")
    print('The bot runs through Cloudflare. You can close this Python process.')
    print('Open the bot → Start → Owner dashboard / Open K9 Service.')
    if info.get('last_error_message'):
        print('Telegram has a previous delivery error recorded. Send /start and check --status again.')


def poll(c: dict):
    me = telegram(c, 'getMe')
    website_check(c, me)
    configure_menu(c)
    telegram(c, 'deleteWebhook', {'drop_pending_updates': False})
    print('Polling bridge started. Keep this process and internet connection running.')
    print('Use --connect later to restore Cloudflare webhook mode.')
    try:
        saved_offset = json.loads(OFFSET_FILE.read_text())
        offset = int(saved_offset['offset']) if saved_offset.get('bot_id') == me['id'] else 0
    except (OSError, ValueError, TypeError, AttributeError, KeyError):
        offset = 0
    while True:
        try:
            updates = telegram(c, 'getUpdates', {'offset': offset, 'timeout': 25, 'allowed_updates': ['message', 'callback_query']}, timeout=35)
            for update in updates:
                response = request_json(c['SITE_URL'] + '/api/telegram/webhook', update, {'x-telegram-bot-api-secret-token': c['TELEGRAM_WEBHOOK_SECRET']})
                if not response.get('ok'):
                    raise ConnectionError('The website could not process this update; it will be retried.')
                offset = int(update['update_id']) + 1
                private_write(OFFSET_FILE, json.dumps({'bot_id': me['id'], 'offset': offset}))
        except ConnectionError as error:
            if error.code == 409:
                raise ConnectionError('Another polling process or webhook is active. Stop the other bot process; run only one polling bridge.') from None
            print('Connection interrupted; retrying. ' + str(error))
            time.sleep(min(30, max(3, error.retry_after)))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modes = parser.add_mutually_exclusive_group()
    for flag in ('setup', 'check', 'status', 'connect', 'poll'):
        modes.add_argument('--' + flag, action='store_true')
    args = parser.parse_args(argv)
    print('K9 Service connector v' + VERSION)
    try:
        saved = load_config()
        if args.setup or (not saved and not args.check and not args.status):
            c = setup(saved)
            if args.setup:
                return 0
        else:
            c = validate(saved)
        if args.check:
            print('Local settings valid. No network requests were made.')
        elif args.status:
            me = telegram(c, 'getMe')
            website_check(c, me)
            info = telegram(c, 'getWebhookInfo')
            print(f"Bot: @{me['username']} | Website verified | Mode: {'webhook' if info.get('url') else 'polling/not connected'}")
            print('Pending updates:', info.get('pending_update_count', 0))
            if info.get('last_error_message'):
                print('Last Telegram webhook error:', info['last_error_message'])
        elif args.poll:
            poll(c)
        else:
            connect(c)
        return 0
    except KeyboardInterrupt:
        print('\nStopped.')
        return 0
    except ConnectionError as error:
        print('\nK9 setup: ' + str(error))
        return 2

if __name__ == '__main__':
    sys.exit(main())
