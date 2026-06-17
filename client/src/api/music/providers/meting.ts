import type { MusicProvider, SearchResult } from '../types';
import type { MusicSource } from '../../../types';
import { tencentCyapiProvider } from './cyapi';

const API_BASE = '/api/meting';

async function metingFetch<T>(server: MusicSource, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ server, ...params });
  const res = await fetch(`${API_BASE}?${query}`);
  if (!res.ok) throw new Error('API 请求失败');
  return res.json();
}

async function metingText(server: MusicSource, params: Record<string, string>): Promise<string> {
  const query = new URLSearchParams({ server, ...params });
  const res = await fetch(`${API_BASE}?${query}`);
  return res.text();
}

function extractIdFromUrl(url: string): string {
  try {
    const match = url.match(/[?&]id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function normalizeSong(raw: Record<string, unknown>, source: MusicSource): SearchResult {
  const artist = raw.artist ?? raw.author;
  const artistStr = Array.isArray(artist)
    ? (artist as Array<{ name?: string }>).map((a) => a.name).join(' / ')
    : String(artist || '未知歌手');

  const urlStr = raw.url ? String(raw.url) : '';
  const id = String(raw.id || extractIdFromUrl(urlStr) || '');

  return {
    id,
    source,
    name: String(raw.name || raw.title || '未知歌曲'),
    artist: artistStr,
    album: String(raw.album || raw.album_name || ''),
    pic: String(raw.pic || raw.cover || raw.album_pic || ''),
    duration: Number(raw.duration || raw.dt || 0) || undefined,
    url: urlStr || undefined,
    lrc: raw.lrc ? String(raw.lrc) : undefined,
  };
}

function createMetingProvider(
  source: Extract<MusicSource, 'netease' | 'tencent'>,
  meta: Omit<import('../types').MusicProviderMeta, 'id'>,
): MusicProvider {
  const cyapi = source === 'tencent' ? tencentCyapiProvider : null;

  return {
    id: source,
    ...meta,
    async search(keyword) {
      if (cyapi && meta.supportsSearch) {
        return cyapi.search(keyword);
      }
      if (!meta.supportsSearch || !keyword.trim()) return [];
      const data = await metingFetch<Record<string, unknown>[]>(source, {
        type: 'search',
        id: keyword.trim(),
      });
      if (!Array.isArray(data)) return [];
      return data.map((item) => normalizeSong(item, source)).filter((s) => s.id);
    },
    async getSongById(id) {
      if (!id.trim()) return null;
      const data = await metingFetch<Record<string, unknown> | Record<string, unknown>[]>(source, {
        type: 'song',
        id: id.trim(),
      });
      const raw = Array.isArray(data) ? data[0] : data;
      if (!raw) return null;
      const song = normalizeSong(raw, source);
      return song.id ? song : null;
    },
    async getSongUrl(song) {
      if (song.url?.startsWith('http')) return song.url;
      const query = new URLSearchParams({ server: song.source, type: 'url', id: song.id });
      const res = await fetch(`${API_BASE}?${query}`, { redirect: 'follow' });
      const text = await res.text();
      if (text.startsWith('@')) return text.slice(1);
      if (text.startsWith('http')) return text;
      return res.url;
    },
    async getLyrics(song) {
      if (song.lrc?.startsWith('[')) return song.lrc;
      if (cyapi && song.source === 'tencent') return cyapi.getLyrics(song);
      return metingText(song.source, { type: 'lrc', id: song.id });
    },
    getCoverUrl(song) {
      if (song.pic) return song.pic;
      if (cyapi) return cyapi.getCoverUrl(song);
      return `${API_BASE}?server=${song.source}&type=pic&id=${song.id}`;
    },
  };
}

export const neteaseProvider = createMetingProvider('netease', {
  name: '网易云音乐',
  shortName: '网易',
  color: '#ec4141',
  supportsSearch: true,
  supportsIdLookup: true,
});

export const tencentProvider = createMetingProvider('tencent', {
  name: 'QQ音乐',
  shortName: 'QQ',
  color: '#31c27c',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '通过 cyapi 搜索，Meting 播放',
});
