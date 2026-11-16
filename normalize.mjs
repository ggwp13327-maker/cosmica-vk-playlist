export const PLAYLIST = 'https://vkvideo.ru/playlist/-172786855_2';
export const OWNER = -172786855;
const playerHosts = new Set(['vk.com', 'vk.ru', 'vkvideo.ru']);

export function safePlayer(value, ownerId, id) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !playerHosts.has(url.hostname) || url.pathname !== '/video_ext.php') return null;
    if (url.searchParams.get('oid') !== String(ownerId) || url.searchParams.get('id') !== String(id)) return null;
    // Keep only public embedding parameters. Never copy session/API parameters.
    for (const key of [...url.searchParams.keys()]) if (!['oid', 'id', 'hash', 'hd', 'js_api'].includes(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}

export function durationSeconds(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0)) return 0;
  return parts.reduce((n, p) => n * 60 + p, 0);
}

export function normalizePlaylist(cards, metadata, now = new Date().toISOString()) {
  const seen = new Set();
  const videos = [];
  for (const card of cards) {
    const match = /\/video(-?\d+)_(\d+)(?:[/?#]|$)/.exec(card.url || '');
    // The page also renders a playlist-cover card linking to its first video.
    if (!match || !card.duration || Number(match[1]) !== OWNER) continue;
    const ownerId = Number(match[1]), id = Number(match[2]), key = `${ownerId}_${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const details = metadata.get(key);
    if (details?.can_embed === 0 || details?.can_embed === false || details?.is_private === 1 || details?.is_private === true) continue;
    const embedUrl = safePlayer(details?.player, ownerId, id);
    if (!embedUrl) throw Error('EMBED_METADATA_MISSING');
    const title = typeof card.title === 'string' ? card.title : details?.title;
    if (typeof title !== 'string' || !title.trim()) throw Error('TITLE_MISSING');
    const images = (details?.image || []).filter(i => typeof i.url === 'string' && i.url.startsWith('https://')).sort((a,b) => (a.width || 0) - (b.width || 0));
    const poster = (images.filter(i => (i.width || 0) <= 1280).at(-1) || images.at(-1))?.url || card.poster || '';
    videos.push({id, ownerId, title, duration: Number(details?.duration) || durationSeconds(card.duration), poster: /^https:\/\//.test(poster) ? poster : '', embedUrl, url: `https://vkvideo.ru/video${ownerId}_${id}`});
  }
  if (!seen.size) throw Error('PLAYLIST_NOT_READY');
  return {playlistUrl: PLAYLIST, total: videos.length, updatedAt: now, source: 'public-playlist-parser', videos};
}
