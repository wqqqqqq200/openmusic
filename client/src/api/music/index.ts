import type { MusicSource, SearchResult, Song } from '../../types';
import type { MusicProviderMeta } from './types';
import { providers, getAllSources } from './sources';
import { interleaveSearchResults } from './merge';
import { hasValidLrc, fetchFallbackLrc } from './lrcFallback';

function getProvider(source: MusicSource) {
  return providers[source];
}

export async function searchSongs(source: MusicSource, keyword: string): Promise<SearchResult[]> {
  return getProvider(source).search(keyword);
}

export interface SearchAllSongsOptions {
  dedupeCrossSource?: boolean;
}

/** 并行搜索，多平台交替合并 */
export async function searchAllSongs(
  keyword: string,
  sourceList?: MusicProviderMeta[],
  options: SearchAllSongsOptions = {},
): Promise<SearchResult[]> {
  if (!keyword.trim()) return [];

  const sources = (sourceList ?? getAllSources()).filter((s) => s.supportsSearch);
  const batches = await Promise.allSettled(
    sources.map((meta) => searchSongs(meta.id, keyword)),
  );

  const groups: Partial<Record<MusicSource, SearchResult[]>> = {};
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (batch.status === 'fulfilled') {
      groups[sources[i].id] = batch.value;
    }
  }

  return interleaveSearchResults(groups, {
    dedupeCrossSource: options.dedupeCrossSource,
  });
}

export { interleaveSearchResults, mergeSearchResults, songKey, artistGroupKey, trackTitleKey } from './merge';
export type { InterleaveOptions } from './merge';

export async function getSongById(source: MusicSource, id: string): Promise<SearchResult | null> {
  return getProvider(source).getSongById(id);
}

export async function getSongUrl(song: Pick<Song, 'id' | 'source' | 'url'>): Promise<string> {
  const source = song.source || 'netease';
  return getProvider(source).getSongUrl({ ...song, source });
}

export async function getLyrics(song: Pick<Song, 'id' | 'source' | 'lrc' | 'name'>): Promise<string> {
  const source = song.source || 'netease';
  let lrc = '';

  try {
    lrc = await getProvider(source).getLyrics({ ...song, source });
  } catch {
    lrc = '';
  }

  if (hasValidLrc(lrc)) return lrc;

  if (song.name) {
    const fallback = await fetchFallbackLrc(song.name);
    if (fallback) return fallback;
  }

  return lrc;
}

export function getCoverUrl(song: Pick<Song, 'id' | 'source' | 'pic'>): string {
  const source = song.source || 'netease';
  return getProvider(source).getCoverUrl({ ...song, source });
}

export function getSourceLabel(source?: MusicSource): string {
  if (!source) return '网易';
  return getProvider(source).shortName;
}

export function parseLrc(lrc: string): import('../../types').LyricLine[] {
  const lines: import('../../types').LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const line of lrc.split('\n')) {
    const match = line.match(regex);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, '0'), 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();

    if (text) lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/** 过滤 LRC 中的制作信息、歌手标注等非演唱歌词 */
const CREDIT_LINE_RE =
  /^(歌手|演唱|原唱|专辑|来源|OP|SP|版权|未经许可|宣传|策划|统筹|发行|出品|监制|配唱|监唱|制作|录音|混音|母带|编曲|作曲|作词|吉他|贝斯|鼓|键盘|和声|弦乐|钢琴|打击乐|营销推广|音乐制作|音乐监制|歌曲监制|和声编写|弦乐编写|混音工程师|录音工程师|母带工程师|制作统筹|人声|弦乐演奏|吉他演奏|贝斯演奏|鼓演奏)\s*[:：]/i;

export function filterDisplayLyrics(lines: import('../../types').LyricLine[]): import('../../types').LyricLine[] {
  return lines.filter((line) => {
    const text = line.text.trim();
    if (!text) return false;
    return !CREDIT_LINE_RE.test(text);
  });
}

/** 歌词结束后常见纯音乐尾奏预留（秒） */
const LRC_TAIL_PADDING_SEC = 20;

/** 从 LRC 推算时长（毫秒）；可与接口元数据取较大值作为加载前估算 */
export function getDurationFromLrc(lrc: string, metadataMs?: number): number | undefined {
  const lines = parseLrc(lrc);
  const fromMeta = metadataMs && metadataMs > 0 ? metadataMs : undefined;

  if (lines.length === 0) return fromMeta;

  const fromLrc = Math.round((lines[lines.length - 1].time + LRC_TAIL_PADDING_SEC) * 1000);
  if (fromMeta) return Math.max(fromLrc, fromMeta);
  return fromLrc;
}

export function getTrackKey(song: { queueId?: string; id: string; source?: MusicSource }): string {
  return `${song.queueId || song.id}-${song.source || 'netease'}`;
}

export async function resolveDurationFromLyrics(
  song: Pick<Song, 'id' | 'source' | 'name' | 'lrc' | 'duration'>,
): Promise<number | undefined> {
  const lrc = await getLyrics(song);
  return getDurationFromLrc(lrc, song.duration);
}

export async function createRoom(): Promise<{ id: string }> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error('创建房间失败');
  return res.json();
}

export async function checkRoom(id: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${id}`);
  return res.ok;
}

export async function getAvailableSources(): Promise<MusicProviderMeta[]> {
  try {
    const res = await fetch('/api/music/sources');
    if (res.ok) return res.json();
  } catch {
    // fallback
  }
  return getAllSources();
}

export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export { getAllSources, providers };
