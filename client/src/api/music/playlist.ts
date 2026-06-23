import type { MusicSource, SearchResult } from '../../types';
import { fetchWithTimeout } from '../http';

export type PlaylistPlatform = 'netease' | 'qq';

export interface PlaylistImportResult {
  name: string;
  playlistId?: string;
  source: MusicSource;
  songs: SearchResult[];
  total: number;
  failed?: number;
}

export interface NeteasePlaylistSearchItem {
  id: string;
  name: string;
  coverImgUrl?: string;
  creatorName?: string;
  trackCount: number;
  playCount: number;
}

export interface NeteasePlaylistSearchResult {
  playlists: NeteasePlaylistSearchItem[];
  total: number;
  page: number;
  limit: number;
}

export async function importPlaylist(
  platform: PlaylistPlatform,
  input: string,
): Promise<PlaylistImportResult> {
  const res = await fetchWithTimeout(
    '/api/music/playlist/import',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, input: input.trim() }),
    },
    120000,
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : '歌单导入失败');
  }
  return data as PlaylistImportResult;
}

export async function searchNeteasePlaylists(
  keyword: string,
  page = 1,
  limit = 20,
): Promise<NeteasePlaylistSearchResult> {
  const params = new URLSearchParams({
    keyword: keyword.trim(),
    page: String(page),
    limit: String(limit),
  });
  const res = await fetchWithTimeout(`/api/music/netease/playlists/search?${params.toString()}`, {}, 15000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : '歌单搜索失败');
  }
  return data as NeteasePlaylistSearchResult;
}
