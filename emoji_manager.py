"""Shared K9 emoji, rich/HTML send/edit and native button icons; no polling."""
import json
import logging
from html import escape
from pathlib import Path
import re
from bot import ConnectionError, telegram

ROOT = Path(__file__).resolve().parent / 'emoji'
LOG = logging.getLogger('k9.emoji')


def config(name, fallback):
    try:
        return json.loads((ROOT / name).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback


def strip_custom_emoji(text):
    return re.sub(r'<tg-emoji\b[^>]*>(.*?)</tg-emoji>', r'\1', text,
                  flags=re.IGNORECASE | re.DOTALL)


def custom_emoji_entity(text, entities):
    encoded = text.encode('utf-16-le')
    for entity in entities or []:
        emoji_id = entity.get('custom_emoji_id')
        offset, length = entity.get('offset'), entity.get('length')
        if (entity.get('type') != 'custom_emoji' or not isinstance(emoji_id, str)
                or not re.fullmatch(r'\d+', emoji_id) or not isinstance(offset, int)
                or not isinstance(length, int) or offset < 0 or length < 1
                or (offset + length) * 2 > len(encoded)):
            continue
        try:
            fallback = encoded[offset * 2:(offset + length) * 2].decode('utf-16-le')
        except UnicodeDecodeError:
            continue
        if fallback:
            return {'id': emoji_id, 'fallback': fallback}
    return None


class EmojiManager:
    def __init__(self, roles=None):
        self.roles = roles if roles is not None else config('emoji_ids.json', {})
        self.packs = config('packs.json', [])
        self.presentation = config('presentation.json', {})

    def resolve(self, role, purpose=None):
        definition = self.roles.get(role, {})
        pack_key = purpose or definition.get('pack', 'CATS')
        pack = next((p for p in self.packs if p.get('key') == pack_key), {})
        if not definition:
            LOG.warning('Missing emoji role %s; using normal fallback', role)
            return pack.get('fallback', '🐱'), None
        if definition.get('pack') == pack_key:
            emoji_id = definition.get('id')
            if emoji_id is None:
                return definition.get('fallback') or pack.get('fallback', '🐱'), None
            if isinstance(emoji_id, str) and re.fullmatch(r'\d+', emoji_id):
                return definition.get('fallback') or pack.get('fallback', '🐱'), emoji_id
        LOG.warning('Missing emoji role %s; using pack fallback', role)
        item = next((i for i in config('emoji_catalog.json', {}).get('emojis', [])
                     if i.get('key') == pack.get('default')
                     and i.get('pack_name') == pack.get('name')), {})
        return item.get('fallback') or pack.get('fallback', '🐱'), item.get('custom_emoji_id')

    def e(self, role, purpose=None, custom=True):
        fallback, emoji_id = self.resolve(role, purpose)
        fallback = escape(fallback, quote=False)
        return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>' if custom and emoji_id else fallback

    def btn(self, text, data, role='order', style=None):
        result = {'text': text, 'callback_data': data}
        icon = self.resolve(role)[1]
        if icon:
            result['icon_custom_emoji_id'] = icon
        if style in {'primary', 'success', 'danger'}:
            result['style'] = style
        return result

    def buttons(self, rows, custom=True):
        output = []
        icon = self.resolve('order', 'WORK')[1]
        for row in rows:
            result = []
            for original in row:
                button = {k: v for k, v in original.items() if k not in {'icon_custom_emoji_id', 'style'}}
                fields = str(button.get('callback_data', '')).split(':')
                action = fields[1] if len(fields) > 1 and fields[0] == 'h' else fields[-1]
                if custom:
                    button['style'] = self.presentation.get('button_styles', {}).get(action, self.presentation.get('default_button_style', 'primary'))
                    if icon and self.presentation.get('button_icons', True):
                        button['icon_custom_emoji_id'] = icon
                result.append(button)
            output.append(result)
        return output

    def _deliver(self, bot_config, chat_id, text, rows=None, role='order', rich=True,
                 message_id=None, reply_markup=None, prefix=True):
        editing = message_id is not None
        fields = {'chat_id': chat_id}
        if editing:
            fields['message_id'] = message_id
        title, _, rest = text.partition('\n')
        icon = self.e(role) + ' ' if prefix else ''
        html = icon + '<b>' + escape(title, quote=False) + '</b>'
        if rest:
            html += '\n' + escape(rest, quote=False)
        if not prefix:
            html = escape(text, quote=False)
        markup = {'inline_keyboard': self.buttons(rows)} if rows is not None else reply_markup
        plain_markup = {'inline_keyboard': self.buttons(rows, False)} if rows is not None else reply_markup
        if rich and prefix and self.presentation.get('rich_messages', True):
            rich_html = '<h2>' + icon + escape(title) + '</h2>'
            rich_html += ''.join('<p>' + escape(p).replace('\n', '<br>') + '</p>' for p in rest.split('\n\n') if p)
            method = 'editMessageText' if editing else 'sendRichMessage'
            try:
                return telegram(bot_config, method, {**fields, 'rich_message': {'html': rich_html}, 'reply_markup': markup})
            except ConnectionError as exc:
                if exc.code not in {400, 404} or not re.search(r'rich|html|pars|entit|emoji|button|reply.?markup|method|not supported', str(exc), re.I):
                    raise
                LOG.warning('Rich message rejected: %s', exc)
                if re.search(r'emoji|pars|entit|button|reply.?markup', str(exc), re.I):
                    try:
                        return telegram(bot_config, method, {**fields, 'rich_message': {'html': strip_custom_emoji(rich_html)}, 'reply_markup': plain_markup})
                    except ConnectionError as retry:
                        if retry.code not in {400, 404}:
                            raise
                        LOG.warning('Rich fallback rejected: %s', retry)
        method = 'editMessageText' if editing else 'sendMessage'
        body = {**fields, 'text': html, 'parse_mode': 'HTML', 'reply_markup': markup}
        try:
            return telegram(bot_config, method, body)
        except ConnectionError as exc:
            if exc.code != 400 or not re.search(r'custom.?emoji|pars.*entit|button|reply.?markup', str(exc), re.I):
                raise
            LOG.warning('HTML emoji fallback: %s', exc)
            return telegram(bot_config, method, {**body, 'text': strip_custom_emoji(html), 'reply_markup': plain_markup})

    def send(self, bot_config, chat_id, text, **kw):
        return self._deliver(bot_config, chat_id, text, **kw)

    def edit(self, bot_config, chat_id, message_id, text, **kw):
        return self._deliver(bot_config, chat_id, text, message_id=message_id, **kw)


_default = EmojiManager()
e = _default.e
btn = _default.btn
buttons = _default.buttons
send = _default.send
edit = _default.edit
