import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OWNER,normalizePlaylist,safePlayer} from './normalize.mjs';
import {createFeedStore} from './feed-store.mjs';

const card=(id=1)=>({url:`https://vkvideo.ru/video${OWNER}_${id}?pl=${OWNER}_2`,title:'Текст из VK — без изменения',duration:'3:05',poster:'https://example.com/poster.jpg'});
const detail=(id=1)=>({id,owner_id:OWNER,player:`https://vkvideo.ru/video_ext.php?oid=${OWNER}&id=${id}&hash=abcd&api_hash=not-for-browser&access_token=not-for-browser`,duration:185});
const metadata=(ids)=>new Map(ids.map(id=>[`${OWNER}_${id}`,detail(id)]));

test('Only playlist videos enter the feed; cover duplicates are ignored; public title is preserved',()=>{
 const data=normalizePlaylist([card(1),card(2),{...card(1),title:'Обложка плейлиста',duration:null}],metadata([1,2]));
 assert.equal(data.total,2);assert.equal(data.videos[0].title,card().title);assert.equal(data.videos[0].duration,185);
 assert.doesNotMatch(JSON.stringify(data),/not-for-browser|access_token|api_hash/);
});
test('Partial embed data cannot silently remove a newly added video',()=>{
 assert.throws(()=>normalizePlaylist([card(1),card(2)],metadata([1])),/EMBED_METADATA_MISSING/);
});
test('Wrong hosts and mismatching video identities cannot become iframe URLs',()=>{
 assert.equal(safePlayer(`https://example.com/video_ext.php?oid=${OWNER}&id=1`,OWNER,1),null);
 assert.equal(safePlayer(`https://vkvideo.ru/video_ext.php?oid=${OWNER}&id=2`,OWNER,1),null);
});
test('Refresh adds and removes videos; an upstream failure preserves the last successful feed on disk and after restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cosmica-vk-test-'));const file=join(directory,'playlist.json');
 let next=normalizePlaylist([card(1)],metadata([1]));
 const store=await createFeedStore({file,load:async()=>{if(next instanceof Error)throw next;return next;}});
 try {
  assert.equal(await store.refresh(),true);assert.equal(store.feed.total,1);
  next=normalizePlaylist([card(1),card(2)],metadata([1,2]));await store.refresh();assert.equal(store.feed.total,2);
  next=normalizePlaylist([card(2)],metadata([2]));await store.refresh();assert.equal(store.feed.videos[0].id,2);
  const saved=await readFile(file,'utf8');next=Error('VK unavailable');assert.equal(await store.refresh(),false);
  assert.equal(await readFile(file,'utf8'),saved);assert.equal(store.feed.videos[0].id,2);
  const restarted=await createFeedStore({file,load:async()=>{throw Error();}});assert.equal(restarted.feed.videos[0].id,2);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('Concurrent refreshes share one browser scrape',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cosmica-vk-test-'));let calls=0,release;
 const store=await createFeedStore({file:join(directory,'feed.json'),load:async()=>{calls++;await new Promise(r=>release=r);return normalizePlaylist([card()],metadata([1]));}});
 try {const first=store.refresh(),second=store.refresh();assert.equal(first,second);release();await first;assert.equal(calls,1);}finally{await rm(directory,{recursive:true,force:true});}
});
