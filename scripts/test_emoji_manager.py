import unittest
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import ConnectionError
from emoji_manager import EmojiManager, custom_emoji_entity


class EmojiTests(unittest.TestCase):
    def test_utf16_after_astral_character(self):
        entity = {'type': 'custom_emoji', 'offset': 6, 'length': 2,
                  'custom_emoji_id': '5278611606756942667'}
        self.assertEqual(custom_emoji_entity('😀 xx ❤️', [entity]),
                         {'id': '5278611606756942667', 'fallback': '❤️'})

    def test_id_string_and_native_button(self):
        manager = EmojiManager()
        self.assertIn('<tg-emoji emoji-id="', manager.e('order'))
        button = manager.btn('Order', 'confirm', 'order', 'success')
        self.assertIsInstance(button['icon_custom_emoji_id'], str)
        self.assertNotIn('<tg-emoji', button['text'])

    def test_rich_fallback_and_html_edit(self):
        manager = EmojiManager()
        with patch('emoji_manager.telegram', side_effect=[
                ConnectionError('Rich message rejected', 400), {'message_id': 1}]) as api:
            manager.edit({}, 1, 1, 'Order\n<User>')
            method, body = api.call_args.args[1:]
            self.assertEqual(method, 'editMessageText')
            self.assertEqual(body['parse_mode'], 'HTML')
            self.assertIn('&lt;User&gt;', body['text'])

    def test_parse_failure_strips_tags_keeps_rich(self):
        with patch('emoji_manager.telegram', side_effect=[
                ConnectionError("Bad Request: can't parse entities", 400), {'message_id': 1}]) as api:
            EmojiManager().send({}, 1, 'Title')
            self.assertEqual(api.call_args.args[1], 'sendRichMessage')
            self.assertNotIn('<tg-emoji', api.call_args.args[2]['rich_message']['html'])

    def test_network_error_is_not_a_format_fallback(self):
        with patch('emoji_manager.telegram', side_effect=ConnectionError('Unavailable', 503)) as api:
            with self.assertRaises(ConnectionError):
                EmojiManager().send({}, 1, 'Title')
            self.assertEqual(api.call_count, 1)

    def test_force_reply_visible_text_remains_exact(self):
        with patch('emoji_manager.telegram', return_value={'message_id': 1}) as api:
            text = 'K9 Hosting · Reply here with a .py, .js or .zip document (up to 20 MB).'
            EmojiManager().send({}, 1, text, rich=False, prefix=False,
                                reply_markup={'force_reply': True})
            self.assertEqual(api.call_args.args[2]['text'], text)


if __name__ == '__main__':
    unittest.main()
