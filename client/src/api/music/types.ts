import type { LyricLine, MusicSource, SearchResult, Song } from '../../types';

export interface MusicProviderMeta {
  id: MusicSource;
  name: string;
  shortName: string;
  color: string;
  supportsSearch: boolean;
  supportsIdLookup: boolean;
  description?: string;
}

export interface MusicProvider extends MusicProviderMeta {
  search(keyword: string): Promise<SearchResult[]>;
  getSongById(id: string): Promise<SearchResult | null>;
  getSongUrl(song: Pick<Song, 'id' | 'source' | 'url'>): Promise<string>;
  getLyrics(song: Pick<Song, 'id' | 'source' | 'lrc'>): Promise<string>;
  getCoverUrl(song: Pick<Song, 'id' | 'source' | 'pic'>): string;
}

export type { LyricLine, SearchResult, Song };
