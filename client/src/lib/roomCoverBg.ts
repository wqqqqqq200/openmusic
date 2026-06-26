const ROOM_COVER_BG_KEY = 'openmusic:room-cover-bg-enabled';

export function readRoomCoverBgEnabled(): boolean {
  try {
    const value = sessionStorage.getItem(ROOM_COVER_BG_KEY);
    if (value === '0') return false;
    if (value === '1') return true;
  } catch {
    // sessionStorage may be unavailable.
  }
  return true;
}

export function writeRoomCoverBgEnabled(enabled: boolean) {
  try {
    sessionStorage.setItem(ROOM_COVER_BG_KEY, enabled ? '1' : '0');
  } catch {
    // sessionStorage may be unavailable.
  }
}
