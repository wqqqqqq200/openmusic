const CYAPI_BASE = (
  process.env.CYAPI_BASE
  || process.env.CYAPI_URL?.replace(/\/qq_music\.php$/i, '')
  || 'https://cyapi.top/API'
).replace(/\/$/, '');

const CYAPI_KEY = process.env.CYAPI_KEY || '';

export function isCyapiConfigured() {
  return Boolean(CYAPI_KEY);
}

export function getCyapiKey() {
  return CYAPI_KEY;
}

export function qqMusicEndpoint() {
  if (process.env.CYAPI_URL) {
    return process.env.CYAPI_URL.replace(/\/$/, '');
  }
  return `${CYAPI_BASE}/qq_music.php`;
}

export function kugouMusicEndpoint() {
  return `${CYAPI_BASE}/kugou_music.php`;
}

function withApiKey(params) {
  const search = new URLSearchParams(params);
  search.set('apikey', CYAPI_KEY);
  return search;
}

/** QQ 音乐搜索：n=1..num 并行拉取 */
export async function searchQqMusic(keyword, num = 15) {
  const limit = Math.min(Math.max(num, 1), 30);
  const endpoint = qqMusicEndpoint();

  const tasks = Array.from({ length: limit }, (_, i) => {
    const params = withApiKey({
      msg: keyword,
      num: String(limit),
      type: 'json',
      n: String(i + 1),
    });
    return fetch(`${endpoint}?${params}`).then((r) => r.json());
  });

  const results = await Promise.allSettled(tasks);
  const songs = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const data = result.value;
    if (!data || data.error || !data.id) continue;
    songs.push(data);
  }

  return songs;
}

/** 酷狗音乐搜索 */
export async function searchKugouMusic(keyword, limit = 15) {
  const params = withApiKey({ msg: keyword });
  const response = await fetch(`${kugouMusicEndpoint()}?${params}`);
  const data = await response.json();

  if (!data || data.code !== 200 || !Array.isArray(data.list)) {
    return [];
  }

  return data.list.slice(0, Math.min(Math.max(limit, 1), 30));
}

/** 酷狗音乐详情（播放链接、歌词、封面） */
export async function getKugouSongDetail(id) {
  const params = withApiKey({ id });
  const response = await fetch(`${kugouMusicEndpoint()}?${params}`);
  const data = await response.json();

  if (!data || data.code !== 200 || !data.data) {
    return null;
  }

  const detail = data.data;
  return {
    id,
    name: detail.songName || '',
    artist: detail.singerName || '',
    url: detail.url || '',
    pic: detail.albumImage || '',
    duration: detail.timeLength ? detail.timeLength * 1000 : undefined,
    lrc: detail.lyrics || '',
  };
}
