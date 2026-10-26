import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

spec=importlib.util.spec_from_file_location('k9bot',Path(__file__).resolve().parents[1]/'bot.py')
bot=importlib.util.module_from_spec(spec);spec.loader.exec_module(bot)
CONFIG={'BOT_TOKEN':'123456:local-test-token-not-for-telegram','BOT_USERNAME':'k9_test_bot','OWNER_TELEGRAM_ID':'90001','TELEGRAM_WEBHOOK_SECRET':'local-test-secret-not-for-production-123','SITE_URL':'https://example.test'}
class BotTests(unittest.TestCase):
 def test_settings(self):
  self.assertEqual(bot.validate(CONFIG),CONFIG)
  for change in [{'SITE_URL':'http://example.test'},{'SITE_URL':'https://example.test/owner'},{'SITE_URL':'https://example.test/?token=secret'},{'OWNER_TELEGRAM_ID':'@owner'},{'TELEGRAM_WEBHOOK_SECRET':'short'},{'BOT_TOKEN':'missing'}]:
   with self.assertRaises(bot.ConnectionError):bot.validate({**CONFIG,**change})
 def test_private_settings(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'settings';bot.private_write(p,'test value');self.assertEqual(p.read_text(),'test value');self.assertEqual(p.stat().st_mode&0o777,0o600)
 def test_website_verification(self):
  me={'id':123456,'username':'k9_test_bot'}
  health={'service':'k9-service','missing':[],'tokenValid':True,'bot':me}
  with patch.object(bot,'request_json',side_effect=[health,{'ok':True}]) as request:
   bot.website_check(CONFIG,me);self.assertEqual(request.call_args.args[2]['x-k9-connection-secret'],CONFIG['TELEGRAM_WEBHOOK_SECRET'])
  with patch.object(bot,'request_json',return_value={**health,'missing':['BOT_TOKEN']}):
   with self.assertRaisesRegex(bot.ConnectionError,'BOT_TOKEN'):bot.website_check(CONFIG,me)
  with patch.object(bot,'request_json',return_value={**health,'bot':{'id':99}}):
   with self.assertRaisesRegex(bot.ConnectionError,'different bot tokens'):bot.website_check(CONFIG,me)
 def test_webhook_mode(self):
  calls=[]
  def telegram(c,method,payload=None,**_):
   calls.append((method,payload))
   if method=='getMe':return {'id':123456,'username':'k9_test_bot'}
   if method=='getWebhookInfo':return {'url':'https://example.test/api/telegram/webhook'}
   return True
  with patch.object(bot,'telegram',side_effect=telegram),patch.object(bot,'website_check',return_value={}),patch('builtins.print'):
   bot.connect(CONFIG)
  methods=[m for m,_ in calls];self.assertIn('setWebhook',methods);self.assertNotIn('deleteWebhook',methods);self.assertNotIn('getUpdates',methods)
  owner_menu=[p for m,p in calls if m=='setChatMenuButton' and p.get('chat_id')][0]
  self.assertEqual(owner_menu['menu_button']['web_app']['url'],'https://example.test/owner')
 def test_http_403_diagnostics(self):
  cases=[('https://api.telegram.org/bot'+CONFIG['BOT_TOKEN']+'/getMe',b'<html>Forbidden</html>',{},'Telegram getMe: HTTP 403.'),
   (CONFIG['SITE_URL']+'/api/connection/status',b'<html>Cloudflare blocked</html>',{'cf-ray':'abcd-XYZ'},'K9 website API: HTTP 403.')]
  for url,body,headers,expected in cases:
   with self.subTest(expected=expected),patch.object(bot,'urlopen',side_effect=HTTPError(url,403,'Forbidden',headers,io.BytesIO(body))):
    with self.assertRaises(bot.ConnectionError) as caught:bot.request_json(url)
    message=str(caught.exception);self.assertIn(expected,message);self.assertNotIn(CONFIG['BOT_TOKEN'],message);self.assertNotIn('<html>',message)
    self.assertEqual(caught.exception.code,403)
    if headers:self.assertIn('Cloudflare Ray ID: abcd-XYZ',message)
 def test_json_errors_and_network_failures(self):
  url=CONFIG['SITE_URL']+'/api/connection/status'
  secret=CONFIG['TELEGRAM_WEBHOOK_SECRET']
  body=json.dumps({'error':'Denied '+secret+' '+CONFIG['BOT_TOKEN'],'parameters':{'retry_after':'bad'}}).encode()
  with patch.object(bot,'urlopen',side_effect=HTTPError(url,401,'Unauthorized',{},io.BytesIO(body))):
   with self.assertRaises(bot.ConnectionError) as caught:bot.request_json(url,{}, {'x-k9-connection-secret':secret})
   message=str(caught.exception);self.assertIn('HTTP 401',message);self.assertNotIn(secret,message);self.assertNotIn(CONFIG['BOT_TOKEN'],message)
  with patch.object(bot,'urlopen',side_effect=URLError('private URL '+CONFIG['BOT_TOKEN'])):
   with self.assertRaisesRegex(bot.ConnectionError,'K9 website API: no usable network response'):bot.request_json(url)
  for body in [b'[]',b'null',b'not JSON']:
   error=bot.http_failure(url,403,body,{})
   self.assertEqual(error.code,403)
if __name__=='__main__':unittest.main()
