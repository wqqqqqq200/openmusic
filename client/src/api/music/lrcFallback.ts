const LRC_LINE_RE = /\[\d{2}:\d{2}/;

export function hasValidLrc(text: string): boolean {
  const trimmed = text?.trim() || '';
  if (!trimmed) return false;
  if (/暂无歌词|无歌词|not found|404/i.test(trimmed)) return false;
  return LRC_LINE_RE.test(trimmed);
}

export async function fetchFallbackLrc(songName: string): Promise<string> {
  const name = songName.trim();
  if (!name) return '';

  const params = new URLSearchParams({ msg: name, n: '1' });
  const res = await fetch(`/api/music/lrc-fallback?${params}`);
  if (!res.ok) return '';
  const text = await res.text();
  return hasValidLrc(text) ? text : '';
}
