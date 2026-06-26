import type { RoomState } from '../types';

export function isChatMutedForUser(room: RoomState | null, userId: string | null | undefined): boolean {
  if (!room || !userId) return false;
  if (room.creatorId === userId) return false;
  if (room.muteAll) return true;
  return room.mutedUserIds?.includes(userId) ?? false;
}
