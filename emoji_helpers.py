"""Config-driven custom emoji and button presentation for the Python Hosting worker."""
import json
from html import escape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent / 'emoji'


def config(name, fallback):
    try:
        return json.loads((ROOT / name).read_text())
    except (OSError, ValueError):
        return fallback


def resolve(role, purpose=None):
    roles = config('emoji_roles.json', {})
    definition = roles.get(role, {})
    pack = next((p for p in config('packs.json', [])
                 if p['key'] == (purpose or definition.get('pack', 'CATS'))), {})
    same = definition.get('pack') == pack.get('key')
    fallback = (definition.get('fallback') if same else None) or pack.get('fallback', '🐱')
    key = (definition.get('emoji') if same else None) or pack.get('default')
    for item in config('emoji_ids.json', {}).get('emojis', []):
        if (item.get('key') == key and item.get('pack') == pack.get('key')
                and item.get('pack_name') == pack.get('name')
                and re.fullmatch(r'\d+', item.get('custom_emoji_id', ''))):
            return item.get('fallback') or fallback, item['custom_emoji_id']
    return fallback, None


def e(role, purpose=None, custom=True):
    fallback, emoji_id = resolve(role, purpose)
    fallback = escape(fallback, quote=False)
    return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>' if custom and emoji_id else fallback


def buttons(rows, custom=True):
    settings = config('presentation.json', {})
    icon = resolve('order', 'WORK')[1]
    result = []
    for row in rows:
        output = []
        for original in row:
            button = {k: v for k, v in original.items() if k not in {'icon_custom_emoji_id', 'style'}}
            fields = str(button.get('callback_data', '')).split(':')
            action = fields[1] if len(fields) > 1 and fields[0] == 'h' else fields[-1]
            if custom:
                button['style'] = settings.get('button_styles', {}).get(action, settings.get('default_button_style', 'primary'))
                if icon and settings.get('button_icons'):
                    button['icon_custom_emoji_id'] = icon
            output.append(button)
        result.append(output)
    return result
