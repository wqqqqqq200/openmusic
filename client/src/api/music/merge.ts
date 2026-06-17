import type { MusicSource, SearchResult } from '../../types';

const SOURCE_PRIORITY: Record<MusicSource, number> = {
  netease: 0,
  tencent: 1,
  kugou: 2,
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').trim();
}

/** 歌手名 + 歌名（跨平台去重键） */
export function trackTitleKey(song: Pick<SearchResult, 'name' | 'artist'>): string {
  return `${normalize(song.name)}|${normalize(song.artist)}`;
}

/** 去除完全相同的条目（同平台同 ID） */
function dedupExact(songs: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = `${song.source}:${song.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 跨平台去重：歌名 + 歌手一致视为同一首
 * 保留优先级：网易 > QQ > 酷狗（先丢酷狗，再丢 QQ）
 */
function dedupeCrossSource(songs: SearchResult[]): SearchResult[] {
  const best = new Map<string, SearchResult>();

  for (const song of songs) {
    const key = trackTitleKey(song);
    const prev = best.get(key);
    if (!prev || SOURCE_PRIORITY[song.source] < SOURCE_PRIORITY[prev.source]) {
      best.set(key, song);
    }
  }

  const emitted = new Set<string>();
  const result: SearchResult[] = [];

  for (const song of songs) {
    const key = trackTitleKey(song);
    const winner = best.get(key)!;
    if (song.source !== winner.source || song.id !== winner.id) continue;
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push(song);
  }

  return result;
}

export interface InterleaveOptions {
  /** 跨平台按歌名+歌手去重，优先级：网易 > QQ > 酷狗 */
  dedupeCrossSource?: boolean;
}

/**
 * 网易、QQ、酷狗结果交替排列；可选跨平台去重
 */
export function interleaveSearchResults(
  groups: Partial<Record<MusicSource, SearchResult[]>>,
  options: InterleaveOptions = {},
): SearchResult[] {
  const netease = dedupExact(groups.netease ?? []);
  const tencent = dedupExact(groups.tencent ?? []);
  const kugou = dedupExact(groups.kugou ?? []);
  const merged: SearchResult[] = [];
  const max = Math.max(netease.length, tencent.length, kugou.length);

  for (let i = 0; i < max; i++) {
    if (i < netease.length) merged.push(netease[i]);
    if (i < tencent.length) merged.push(tencent[i]);
    if (i < kugou.length) merged.push(kugou[i]);
  }

  return options.dedupeCrossSource ? dedupeCrossSource(merged) : merged;
}

/** @deprecated 使用 interleaveSearchResults */
export function mergeSearchResults(songs: SearchResult[]): SearchResult[] {
  return dedupExact(songs);
}
export function songKey(song: Pick<SearchResult, 'source' | 'id'>): string {
  return `${song.source}-${song.id}`;
}

/** 歌手名规范化，用于分组标题去重 */
export function artistGroupKey(artist: string): string {
  return normalize(artist);
}
