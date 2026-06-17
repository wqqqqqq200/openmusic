import type { MusicProvider, SearchResult } from '../types';

const API_BASE = '/api/music/cyapi';

interface CyapiArtist {
  name?: string;
}

interface CyapiAlbum {
  name?: string;
}

interface CyapiCover {
  medium?: string;
  large?: string;
  small?: string;
}

interface CyapiSong {
  name?: string;
  id?: string;
  artists?: CyapiArtist[];
  album?: CyapiAlbum;
  duration?: number;
  cover?: CyapiCover;
  url?: string;
  lyric?: { text?: string };
}

function normalizeCyapi(raw: CyapiSong): SearchResult {
  const artists = raw.artists?.map((a) => a.name).filter(Boolean).join(' / ') || '未知歌手';
  return {
    id: String(raw.id || ''),
    source: 'tencent',
    name: String(raw.name || '未知歌曲'),
    artist: artists,
    album: raw.album?.name,
    pic: raw.cover?.medium || raw.cover?.large || raw.cover?.small,
    duration: raw.duration ? raw.duration * 1000 : undefined,
    url: raw.url,
    lrc: raw.lyric?.text,
  };
}

export const tencentCyapiProvider: Pick<MusicProvider, 'search' | 'getSongById' | 'getSongUrl' | 'getLyrics' | 'getCoverUrl'> = {
  async search(keyword) {
    if (!keyword.trim()) return [];
    const params = new URLSearchParams({ q: keyword.trim(), num: '15' });
    const res = await fetch(`${API_BASE}/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as CyapiSong[];
    if (!Array.isArray(data)) return [];
    return data.map(normalizeCyapi).filter((s) => s.id);
  },

  async getSongById() {
    return null;
  },

  async getSongUrl(song) {
    if (song.url?.startsWith('http')) return song.url;
    const query = new URLSearchParams({ server: 'tencent', type: 'url', id: song.id });
    const res = await fetch(`/api/meting?${query}`, { redirect: 'follow' });
    const text = await res.text();
    if (text.startsWith('@')) return text.slice(1);
    if (text.startsWith('http')) return text;
    return res.url;
  },

  async getLyrics(song) {
    if (song.lrc?.startsWith('[')) return song.lrc;
    const query = new URLSearchParams({ server: 'tencent', type: 'lrc', id: song.id });
    const res = await fetch(`/api/meting?${query}`);
    return res.text();
  },

  getCoverUrl(song) {
    if (song.pic) return song.pic;
    return `/api/meting?server=tencent&type=pic&id=${song.id}`;
  },
};
