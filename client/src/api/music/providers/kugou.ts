import type { MusicProvider, SearchResult } from '../types';

interface KugouListItem {
  id: string;
  SongName?: string;
  SingerName?: string;
  AlbumName?: string;
  Duration?: number;
  Image?: string;
}

interface KugouDetail {
  id: string;
  name: string;
  artist: string;
  url: string;
  pic: string;
  duration?: number;
  lrc: string;
}

function normalizeKugou(raw: KugouListItem): SearchResult {
  return {
    id: String(raw.id),
    source: 'kugou',
    name: raw.SongName || '未知歌曲',
    artist: raw.SingerName || '未知歌手',
    album: raw.AlbumName || undefined,
    pic: raw.Image || undefined,
    duration: raw.Duration ? raw.Duration * 1000 : undefined,
  };
}

async function fetchKugouDetail(id: string): Promise<KugouDetail | null> {
  const res = await fetch(`/api/music/cyapi/kugou/song?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export const kugouProvider: MusicProvider = {
  id: 'kugou',
  name: '酷狗音乐',
  shortName: '酷狗',
  color: '#2688ee',
  supportsSearch: true,
  supportsIdLookup: false,
  description: '通过迟言 API 搜索',
  async search(keyword) {
    if (!keyword.trim()) return [];
    const params = new URLSearchParams({ q: keyword.trim(), num: '15' });
    const res = await fetch(`/api/music/cyapi/kugou/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as KugouListItem[];
    if (!Array.isArray(data)) return [];
    return data.map(normalizeKugou).filter((s) => s.id);
  },

  async getSongById(id) {
    if (!id.trim()) return null;
    const detail = await fetchKugouDetail(id.trim());
    if (!detail) return null;
    return {
      id: detail.id,
      source: 'kugou',
      name: detail.name,
      artist: detail.artist,
      pic: detail.pic,
      duration: detail.duration,
      url: detail.url,
      lrc: detail.lrc,
    };
  },

  async getSongUrl(song) {
    if (song.url?.startsWith('http')) return song.url;
    const detail = await fetchKugouDetail(song.id);
    if (!detail?.url) throw new Error('无法获取播放链接');
    return detail.url;
  },

  async getLyrics(song) {
    if (song.lrc?.startsWith('[')) return song.lrc;
    const detail = await fetchKugouDetail(song.id);
    return detail?.lrc || '';
  },

  getCoverUrl(song) {
    return song.pic || '';
  },
};
