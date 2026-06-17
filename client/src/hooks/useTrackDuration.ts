import { useAudioStore } from '../stores/audioStore';
import { getTrackKey } from '../api/music';
import type { Song, QueueItem } from '../types';

type TrackSong = Pick<Song, 'duration' | 'id' | 'source'> &
  Partial<Pick<QueueItem, 'queueId'>>;

/** 优先用真实音频时长，其次接口元数据，最后用歌词推算 */
export function useTrackDuration(song: TrackSong | null | undefined): number {
  const lrcDurationMs = useAudioStore((s) => s.lrcDurationMs);
  const lrcTrackKey = useAudioStore((s) => s.lrcTrackKey);
  const mediaDurationMs = useAudioStore((s) => s.mediaDurationMs);
  const mediaTrackKey = useAudioStore((s) => s.mediaTrackKey);

  if (!song) return 0;

  const key = getTrackKey(song as Pick<QueueItem, 'queueId' | 'id' | 'source'>);

  if (mediaTrackKey === key && mediaDurationMs && mediaDurationMs > 0) {
    return mediaDurationMs / 1000;
  }

  if (song.duration && song.duration > 0) return song.duration / 1000;

  if (lrcTrackKey === key && lrcDurationMs && lrcDurationMs > 0) {
    return lrcDurationMs / 1000;
  }

  return 0;
}
