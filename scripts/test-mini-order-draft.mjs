import assert from 'node:assert/strict';
import {draftStorage,newest,parseSnapshot,resumeDraft,telegramDraftScope} from '../app/mini-order/draft.ts';

const now=Date.now();
const draft={serviceId:'telegram-bot',details:'Keep this brief when I come back.',timing:'month',step:3,requestId:crypto.randomUUID()};
const snapshot={savedAt:now,draft};
const tombstone={savedAt:now+1,draft:null};
assert.deepEqual(parseSnapshot(JSON.stringify(snapshot),now),snapshot);
assert.equal(parseSnapshot(JSON.stringify({...snapshot,savedAt:now-8*86400000}),now),null);
assert.equal(parseSnapshot(JSON.stringify({...snapshot,draft:{...draft,requestId:'invalid'}}),now),null);
assert.deepEqual(newest(tombstone,snapshot),tombstone);
assert.deepEqual(newest(snapshot,tombstone),tombstone);
assert.deepEqual(resumeDraft(draft,['telegram-bot']),draft);
assert.deepEqual(resumeDraft(draft,['website']),{...draft,serviceId:'',step:1});
assert.deepEqual(resumeDraft(draft,['telegram-bot','website'],'website'),{...draft,serviceId:'website',step:1});
assert.equal(telegramDraftScope(new URLSearchParams({user:JSON.stringify({id:1234})}).toString()),'1234');
assert.equal(telegramDraftScope('user=invalid'),null);

let stored='';
const cloud={
 getItem(key,callback){assert.equal(key,'k9_draft');callback(null,stored);},
 setItem(key,value,callback){assert.equal(key,'k9_draft');stored=value;setTimeout(()=>callback(null,true),5);}
};
const storage=draftStorage(null,cloud);
storage.save(draft,true);
assert.equal((await storage.restore()).draft.requestId,draft.requestId);
storage.save(draft,true);
storage.save(null,true);
assert.equal((await storage.restore()).draft,null);
console.log('Mini App draft: resume, scope, expiry, CloudStorage sequencing, and completed draft clearing verified.');
