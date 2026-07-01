import { useMemo } from 'react';
import { songKey } from '../api/music';
import { useRoomStore } from '../stores/roomStore';
import { useSongHistoryStore } from '../stores/songHistoryStore';
import type { RoomState, Song } from '../types';

const EMPTY_SET = new Set<string>();

function buildQueueKeySignature(room: RoomState | null | undefined): string {
  if (!room) return '';
  const parts: string[] = [];
  if (room.current) parts.push(songKey(room.current));
  for (const item of room.queue) parts.push(songKey(item));
  return parts.join('\x00');
}

function buildHistoryKeySignature(items: Song[] | undefined): string {
  if (!items?.length) return '';
  return items.map((item) => songKey(item)).join('\x00');
}

/** 队列 / 已播放键集合；仅在队列或历史变化时更新，不受播放进度影响 */
export function useRoomSongKeySets() {
  const roomId = useRoomStore((s) => s.room?.id ?? '');
  const queueSignature = useRoomStore((s) => buildQueueKeySignature(s.room));
  const roomHistorySignature = useRoomStore((s) => buildHistoryKeySignature(s.room?.songHistory));
  const clientHistorySignature = useSongHistoryStore((s) => {
    if (!s.loaded || s.roomId !== roomId) return '';
    return buildHistoryKeySignature(s.songs);
  });

  return useMemo(() => {
    if (!queueSignature && !roomHistorySignature && !clientHistorySignature) {
      return { queueKeys: EMPTY_SET, playedKeys: EMPTY_SET };
    }

    const queueKeys = new Set<string>();
    if (queueSignature) {
      for (const key of queueSignature.split('\x00')) queueKeys.add(key);
    }

    const historyKeys = new Set<string>();
    const historySig = clientHistorySignature || roomHistorySignature;
    if (historySig) {
      for (const key of historySig.split('\x00')) historyKeys.add(key);
    }

    const playedKeys = new Set<string>();
    for (const key of historyKeys) {
      if (!queueKeys.has(key)) playedKeys.add(key);
    }

    return { queueKeys, playedKeys };
  }, [queueSignature, roomHistorySignature, clientHistorySignature]);
}
