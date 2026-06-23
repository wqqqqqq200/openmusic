const METING_API_URL = (process.env.METING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const METING_API_AUTH = process.env.METING_API_AUTH || '';

const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Accept: 'application/json',
};

const NETEASE_SONG_DETAIL_BATCH = 500;

function buildMetingUrl(query) {
  const params = new URLSearchParams(query);
  if (METING_API_AUTH && !params.has('auth')) {
    params.set('auth', METING_API_AUTH);
  }
  return `${METING_API_URL}/api?${params.toString()}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractUrlFromText(input) {
  const text = String(input || '').trim();
  const match = text.match(/https?:\/\/[^\s\u4e00-\u9fff「」]+/i);
  return match ? match[0].replace(/[.,;，。；)）\]]+$/, '') : text;
}

export function parseNeteasePlaylistId(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^\d{4,}$/.test(text)) return text;

  const url = extractUrlFromText(text);
  if (!/music\.163\.com|y\.music\.163\.com/i.test(url)) return null;

  const idMatch = url.match(/[?&]id=(\d+)/i) || url.match(/playlist\/(\d+)/i);
  return idMatch ? idMatch[1] : null;
}

export function parseQqPlaylistId(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^\d{4,}$/.test(text)) return text;

  const url = extractUrlFromText(text);
  if (!/\.qq\.com/i.test(url)) return null;
  if (!/playlist|songlist|details/i.test(url) && !/[?&]id=\d+/i.test(url)) return null;

  const idMatch = url.match(/[?&]id=(\d+)/i)
    || url.match(/\/playlist\/(\d+)/i)
    || url.match(/\/songlist\/(\d+)/i);
  return idMatch ? idMatch[1] : null;
}

/** @deprecated 使用 parseQqPlaylistId */
export function parseQqPlaylistUrl(input) {
  const id = parseQqPlaylistId(input);
  return id ? String(input).trim() : null;
}

function extractIdFromApiUrl(url) {
  const match = String(url || '').match(/[?&]id=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function normalizeNeteasePlaylistTrack(raw) {
  if (!raw || raw.id == null) return null;
  const artists = Array.isArray(raw.artists) ? raw.artists : [];
  const artist = artists.map((item) => item?.name).filter(Boolean).join(' / ') || '未知歌手';
  return {
    id: String(raw.id),
    source: 'netease',
    name: String(raw.name || '未知歌曲'),
    artist,
    album: String(raw.album?.name || ''),
    pic: String(raw.album?.picUrl || ''),
    duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : undefined,
  };
}

function normalizeMetingPlaylistSong(raw, source) {
  if (!raw || typeof raw !== 'object') return null;

  const id = extractIdFromApiUrl(raw.url) || String(raw.id || raw.mid || '').trim();
  if (!id) return null;

  return {
    id,
    source,
    name: String(raw.title || raw.name || '未知歌曲'),
    artist: String(raw.author || raw.artist || '未知歌手'),
    album: String(raw.album || ''),
    pic: String(raw.pic || raw.cover || ''),
    lrc: raw.lrc ? String(raw.lrc) : undefined,
  };
}

function orderTracksByIds(tracks, trackIds) {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return tracks;
  const map = new Map(tracks.map((track) => [String(track.id), track]));
  return trackIds.map((id) => map.get(String(id))).filter(Boolean);
}

async function fetchNeteaseSongDetails(trackIds) {
  const ids = [...new Set(trackIds.map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) return [];

  const songs = [];
  for (let index = 0; index < ids.length; index += NETEASE_SONG_DETAIL_BATCH) {
    const batch = ids.slice(index, index + NETEASE_SONG_DETAIL_BATCH);
    const response = await fetchWithTimeout(
      `https://music.163.com/api/song/detail/?ids=[${batch.join(',')}]`,
      { headers: NETEASE_HEADERS },
      20000,
    );
    if (!response.ok) throw new Error('歌单歌曲详情请求失败');
    const data = await response.json();
    if (data.code !== 200) {
      throw new Error(data.message || data.msg || '歌单歌曲详情获取失败');
    }
    const batchSongs = Array.isArray(data.songs) ? data.songs : [];
    songs.push(...batchSongs);
  }
  return songs;
}

async function fetchNeteasePlaylistDetailRaw(playlistId, attempt = 0) {
  const response = await fetchWithTimeout(
    `https://music.163.com/api/playlist/detail?id=${encodeURIComponent(playlistId)}`,
    { headers: NETEASE_HEADERS },
    30000,
  );
  if (!response.ok) throw new Error('歌单请求失败');

  const data = await response.json();
  if (data.code === 200 && data.result) return data.result;

  const message = data.message || data.msg || '歌单不存在或无法访问';
  if (data.code === -447 && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    return fetchNeteasePlaylistDetailRaw(playlistId, attempt + 1);
  }
  throw new Error(message);
}

async function fetchNeteasePlaylistDetail(playlistId) {
  const result = await fetchNeteasePlaylistDetailRaw(playlistId);
  const trackIds = Array.isArray(result.trackIds) && result.trackIds.length > 0
    ? result.trackIds.map((id) => String(id))
    : (Array.isArray(result.tracks) ? result.tracks.map((track) => String(track.id)) : []);

  const tracks = Array.isArray(result.tracks) ? result.tracks : [];
  const trackMap = new Map(tracks.map((track) => [String(track.id), track]));
  const missingIds = trackIds.filter((id) => !trackMap.has(id));

  if (missingIds.length > 0) {
    const extraTracks = await fetchNeteaseSongDetails(missingIds);
    for (const track of extraTracks) {
      trackMap.set(String(track.id), track);
    }
  }

  const orderedTracks = trackIds.length > 0
    ? trackIds.map((id) => trackMap.get(id)).filter(Boolean)
    : tracks;

  return {
    name: String(result.name || '网易云歌单'),
    trackCount: Number(result.trackCount || orderedTracks.length),
    tracks: orderedTracks,
  };
}

async function fetchMetingPlaylist(server, playlistId) {
  const url = buildMetingUrl({ server, type: 'playlist', id: playlistId });
  const response = await fetchWithTimeout(url, { headers: NETEASE_HEADERS }, 60000);
  if (!response.ok) throw new Error('歌单请求失败');

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(typeof data?.error === 'string' ? data.error : '歌单数据格式异常');
  }
  return data;
}

async function importMetingPlaylist(server, playlistId, defaultName) {
  const tracks = await fetchMetingPlaylist(server, playlistId);

  if (tracks.length === 0) {
    return {
      name: defaultName,
      playlistId,
      source: server === 'netease' ? 'netease' : 'tencent',
      songs: [],
      total: 0,
      failed: 0,
    };
  }

  const songs = tracks
    .map((track) => normalizeMetingPlaylistSong(track, server === 'netease' ? 'netease' : 'tencent'))
    .filter(Boolean);

  return {
    name: defaultName,
    playlistId,
    source: server === 'netease' ? 'netease' : 'tencent',
    songs,
    total: tracks.length,
    failed: tracks.length - songs.length,
  };
}

export async function importNeteasePlaylist(input) {
  const playlistId = parseNeteasePlaylistId(input);
  if (!playlistId) throw new Error('无法识别网易云歌单链接，请粘贴完整分享链接');

  const detail = await fetchNeteasePlaylistDetail(playlistId);
  const songs = detail.tracks
    .map((track) => normalizeNeteasePlaylistTrack(track))
    .filter(Boolean);

  return {
    name: detail.name,
    playlistId,
    source: 'netease',
    songs,
    total: detail.trackCount,
    failed: Math.max(0, detail.trackCount - songs.length),
  };
}

export async function importQqPlaylist(input) {
  const playlistId = parseQqPlaylistId(input);
  if (!playlistId) {
    throw new Error('无法识别 QQ 音乐歌单链接，请按提示获取分享链接');
  }

  return importMetingPlaylist('tencent', playlistId, 'QQ音乐歌单');
}
