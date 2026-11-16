import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {PLAYLIST, OWNER, normalizePlaylist,safePlayer} from './normalize.mjs';
const require = createRequire(import.meta.url);

async function attempt() {
  const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {})});
  const metadata = new Map(), cards = new Map(), pending = new Set();
  let expected = null;
  try {
    // A new anonymous context each run. No personal profile, login or API token.
    const context = await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU'});
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    await page.route('**/*', route => ['media','font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname !== 'api.vkvideo.ru' || url.pathname !== '/method/video.getFromAlbum') return;
      // Observe only public video metadata already delivered to this page.
      // Request headers, browser tokens and cookies are never read or retained.
      const promise = response.json().then(data => {
        const result = data.response;
        if (!Array.isArray(result?.items)) return;
        if (Number.isInteger(result.count) && result.count >= 0) expected = result.count;
        for (const item of result.items) {
          const v = item.video || item;
          if (Number(v.owner_id) !== OWNER || !Number.isInteger(v.id)) continue;
          metadata.set(`${v.owner_id}_${v.id}`, {id:v.id, owner_id:v.owner_id, title:v.title, duration:v.duration, image:v.image, player:v.player, can_embed:v.can_embed, is_private:v.is_private});
        }
      }).catch(() => {}).finally(() => pending.delete(promise));
      pending.add(promise);
    });
    await page.goto(PLAYLIST, {waitUntil:'domcontentloaded',timeout:40000});
    await page.locator('a[data-testid="video_card_thumb"] [data-testid="video_card_duration"]').first().waitFor({state:'attached'});
    let stable = 0, complete = false;
    for (let n=0;n<40;n++) {
      await Promise.allSettled([...pending]);
      const before = cards.size;
      const current = await page.locator('a[data-testid="video_card_thumb"]').evaluateAll(anchors => anchors.map(a => ({url:a.href, title:a.querySelector('img')?.alt, poster:a.querySelector('img')?.src, duration:a.querySelector('[data-testid="video_card_duration"]')?.textContent})).filter(c => c.duration));
      for (const c of current) cards.set(c.url.split('?')[0], c);
      if (expected !== null && cards.size >= expected) {complete=true;break;}
      stable = cards.size === before ? stable + 1 : 0;
      if (expected === null && stable >= 3) {complete=true;break;}
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(800);
    }
    await Promise.allSettled([...pending]);
    if (!complete || expected !== null && cards.size < expected) throw Error('INCOMPLETE_PLAYLIST');
    return normalizePlaylist([...cards.values()], metadata);
  } finally {await browser.close();}
}

export async function scrapePlaylist() {
  let last;
  for (let n=0;n<2;n++) {
    try {
      const feed=await attempt();
      // Preserve the existing separately added testimonial, explicitly requested
      // by the owner. oEmbed is a public/open method and needs no VK token.
      let extra=[];
      try {extra=JSON.parse(await readFile(new URL('./additional-videos.json',import.meta.url),'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
      for(const video of extra) {
        if(feed.videos.some(v=>v.id===video.id&&v.ownerId===video.ownerId))continue;
        if(video.ownerId!==OWNER||!Number.isInteger(video.id))throw Error('INVALID_ADDITIONAL_VIDEO');
        const url=new URL('https://api.vk.ru/method/video.getOembed');url.searchParams.set('url',`https://vkvideo.ru/video${OWNER}_${video.id}`);url.searchParams.set('v','5.199');
        const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('ADDITIONAL_VIDEO_UNAVAILABLE');
        const data=(await response.json()).response;
        const source=/\bsrc=["']([^"']+)["']/i.exec(data?.html||'')?.[1]?.replace(/&amp;/g,'&');
        const embedUrl=safePlayer(source,OWNER,video.id);
        if(!embedUrl)throw Error('ADDITIONAL_EMBED_MISSING');
        feed.videos.push({id:video.id,ownerId:OWNER,title:video.title,duration:video.duration,poster:typeof data.thumbnail_url==='string'&&data.thumbnail_url.startsWith('https://')?data.thumbnail_url:'',embedUrl,url:`https://vkvideo.ru/video${OWNER}_${video.id}`});
      }
      feed.total=feed.videos.length;
      return feed;
    } catch (error) {last=error;if(n===0)await new Promise(r=>setTimeout(r,1800));}
  }
  throw last;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const data = await scrapePlaylist();
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(data,null,2)+'\n');
    console.log(JSON.stringify({total:data.total,updatedAt:data.updatedAt,embedLinks:data.videos.filter(v=>v.embedUrl).length}));
  } catch {console.error('Public playlist could not be refreshed.');process.exitCode=1;}
}
