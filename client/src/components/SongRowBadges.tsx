import { useMemo } from 'react';
import type { SearchResult } from '../types';
import { useRoomStore } from '../stores/roomStore';
import { getRoomSongStatus } from '../lib/roomSongStatus';
import SourceBadge from './SourceBadge';

const BADGE_CLASS =
  'inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap';

interface Props {
  song: Pick<SearchResult, 'source' | 'id'>;
}

/** 已点歌 / 已播放 / 平台标签 — 同一行、同一高度 */
export default function SongRowBadges({ song }: Props) {
  const room = useRoomStore((s) => s.room);

  const { inQueue, played } = useMemo(
    () => getRoomSongStatus(room, song),
    [room, song.id, song.source],
  );

  return (
    <div className="flex flex-shrink-0 flex-row items-center gap-1">
      {inQueue && (
        <span className={`${BADGE_CLASS} bg-netease-red/15 text-netease-red`}>
          已点歌
        </span>
      )}
      {played && (
        <span className={`${BADGE_CLASS} bg-white/6 text-netease-muted`}>
          已播放
        </span>
      )}
      <SourceBadge source={song.source} variant="muted" className="leading-none" />
    </div>
  );
}
