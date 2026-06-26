import type { Socket } from 'socket.io-client';
import { useRoomStore } from '../stores/roomStore';

let socketGetter: (() => Socket | null) | null = null;

export function bindReportTrackDurationSocket(getSocket: () => Socket | null) {
  socketGetter = getSocket;
}

/** 房主将 LRC/媒体推算时长回传服务端，供自动切歌（不触发 room_update） */
export function reportTrackDurationToServer(queueId: string, durationMs: number) {
  if (!queueId || !Number.isFinite(durationMs) || durationMs <= 0) return;
  const { isPlaybackLeader, room } = useRoomStore.getState();
  if (!isPlaybackLeader || !room?.current || room.current.queueId !== queueId) return;
  if (room.current.duration && room.current.duration > 0) return;

  const socket = socketGetter?.();
  if (!socket?.connected) return;

  socket.timeout(5000).emit(
    'report_track_duration',
    { queueId, durationMs: Math.round(durationMs) },
    () => {},
  );
}
