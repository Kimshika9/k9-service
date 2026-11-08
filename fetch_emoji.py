#!/usr/bin/env python3
"""Fetch real custom emoji IDs. Python 3.10+, standard library; no pip packages."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.request import Request, urlopen


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(f.name, path)


def fetch(token, name):
    request = Request('https://api.telegram.org/bot' + token + '/getStickerSet',
                      data=json.dumps({'name': name}).encode(),
                      headers={'Content-Type': 'application/json'})
    # Do not print exception messages: urllib errors can include the token-bearing URL.
    with urlopen(request, timeout=30) as response:
        data = json.load(response)
    if not data.get('ok') or data.get('result', {}).get('sticker_type') != 'custom_emoji':
        raise ValueError('Unavailable custom emoji pack')
    return data['result']['stickers']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config-dir', default=str(Path(__file__).resolve().parent / 'emoji'))
    parser.add_argument('--offline', action='store_true', help='Print the existing cache without calling Telegram')
    args = parser.parse_args()
    root = Path(args.config_dir).resolve()
    packs = json.loads((root / 'packs.json').read_text())
    cached_path = root / 'emoji_ids.json'
    cached = json.loads(cached_path.read_text()) if cached_path.exists() else {'emojis': []}
    errors, rows = [], []
    if args.offline:
        rows = cached.get('emojis', [])
    else:
        token = os.getenv('BOT_TOKEN', '').strip()
        if not token:
            token = getpass.getpass('Bot token (hidden): ').strip()
        if not re.fullmatch(r'\d{5,}:[A-Za-z0-9_-]{20,}', token):
            print('A valid bot token is required. No request made.')
            return 2
        for pack in packs:
            name, key = pack['name'], pack['key']
            if not re.fullmatch(r'[A-Za-z0-9_]{1,128}', name) or not re.fullmatch(r'[A-Z0-9_]+', key):
                print('Invalid pack config. No further request made.')
                return 2
            try:
                stickers = fetch(token, name)
                for index, sticker in enumerate(stickers, 1):
                    emoji_id = sticker.get('custom_emoji_id')
                    if not isinstance(emoji_id, str) or not emoji_id.isdecimal():
                        continue
                    rows.append({'key': key + ':' + emoji_id, 'pack': key, 'pack_name': name,
                                 'index': index, 'fallback': sticker.get('emoji') or pack.get('fallback') or '✨',
                                 'custom_emoji_id': emoji_id, 'is_animated': bool(sticker.get('is_animated')),
                                 'is_video': bool(sticker.get('is_video'))})
            except Exception:
                errors.append({'pack': key, 'error': 'Fetch failed. Verify the exact /addemoji/ name and retry.'})
                rows.extend(r for r in cached.get('emojis', []) if r.get('pack') == key and r.get('pack_name') == name)
        save(cached_path, {'version': 1, 'emojis': rows, 'errors': errors})
    lines = ['K9 emoji catalog — choose roles by PACK + index; keys stay stable across refreshes.']
    for pack in packs:
        lines.append('\n' + pack['key'] + ' | ' + pack['name'] + ' | ' + pack['purpose'])
        for row in rows:
            if row['pack'] == pack['key']:
                kind = 'video' if row['is_video'] else 'animated' if row['is_animated'] else 'static'
                lines.append(f"{row['index']:03d}. {row['fallback']} | {row['key']} | {kind}")
    lines.extend(e['pack'] + ': ' + e['error'] for e in errors)
    text = '\n'.join(lines) + '\n'
    (root / 'emoji_list.txt').write_text(text, encoding='utf-8')
    print(text)
    print('Saved emoji_ids.json and emoji_list.txt. No roles or pack defaults were selected.')
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
