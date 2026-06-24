import { songKey } from '../api/music';
import type { RoomState, SearchResult, Song } from '../types';

type SongRef = Pick<Song, 'source' | 'id'>;

/** 当前正在播放或仍在队列中 */
export function isSongInRoomQueue(
  room: RoomState | null | undefined,
  song: SongRef,
): boolean {
  if (!room) return false;
  const key = songKey(song);
  if (room.current && songKey(room.current) === key) return true;
  return room.queue.some((item) => songKey(item) === key);
}

/** 曾点过且已不在播放队列（已播完或已被切走） */
export function isSongPlayedInRoom(
  room: RoomState | null | undefined,
  song: SongRef,
): boolean {
  if (!room?.songHistory?.length) return false;
  const key = songKey(song);
  if (!room.songHistory.some((item) => songKey(item) === key)) return false;
  return !isSongInRoomQueue(room, song);
}

export function getRoomSongStatus(
  room: RoomState | null | undefined,
  song: SearchResult | SongRef,
): { inQueue: boolean; played: boolean } {
  const inQueue = isSongInRoomQueue(room, song);
  const played = isSongPlayedInRoom(room, song);
  return { inQueue, played };
}
