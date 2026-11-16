import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export async function createFeedStore({file, load, now=()=>Date.now()}) {
  let feed=null, inFlight=null, lastAttempt=null, lastError=null;
  try {const d=JSON.parse(await readFile(file,'utf8'));if(Array.isArray(d.videos)&&d.source==='public-playlist-parser')feed=d;} catch {}
  return {
    get feed(){return feed;},
    get status(){return {available:!!feed,total:feed?.total||0,lastSuccess:feed?.updatedAt||null,lastAttempt,lastError,refreshing:!!inFlight};},
    refresh() {
      if(inFlight)return inFlight;
      lastAttempt=new Date(now()).toISOString();
      inFlight=(async()=>{
        try {
          const candidate=await load();
          if(!Array.isArray(candidate?.videos)||candidate.source!=='public-playlist-parser'||candidate.total!==candidate.videos.length)throw Error('INVALID_FEED');
          await mkdir(dirname(file),{recursive:true});
          const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(candidate)+'\n',{mode:0o600});await rename(temporary,file);
          feed=candidate;lastError=null;return true;
        } catch {lastError='upstream_unavailable';return false;} finally {inFlight=null;}
      })();
      return inFlight;
    }
  };
}
