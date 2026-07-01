import { memo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import type { SearchResult } from '../types';
import { songKey } from '../api/music';
import SongCover from './SongCover';
import SongRowBadges from './SongRowBadges';
import FavoriteButton from './FavoriteButton';

interface Props {
  song: SearchResult;
  addingId: string | null;
  alwaysShowActions: boolean;
  inQueue: boolean;
  played: boolean;
  favorited: boolean;
  onAdd: (song: SearchResult) => void;
}

function SongResultRow({
  song,
  addingId,
  alwaysShowActions,
  inQueue,
  played,
  favorited,
  onAdd,
}: Props) {
  const key = songKey(song);
  const artistLine = `${song.artist}${song.album ? ` · ${song.album}` : ''}`;

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 active:bg-netease-card/80 sm:gap-3 sm:p-3 [content-visibility:auto] [contain-intrinsic-size:auto_72px]"
      title="双击点歌"
      onDoubleClick={() => onAdd(song)}
    >
      <SongCover
        song={song}
        className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium" title={song.name}>
          {song.name}
        </p>
        <p className="truncate text-xs text-netease-muted" title={artistLine}>
          {artistLine}
        </p>
      </div>
      <SongRowBadges song={song} status={{ inQueue, played }} />
      <FavoriteButton
        song={song}
        favorited={favorited}
        showOnHover={!alwaysShowActions}
        className="h-7 w-7 text-netease-muted hover:text-rose-300"
        iconClassName="h-3.5 w-3.5"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd(song);
        }}
        disabled={addingId === key}
        className={`flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50 ${alwaysShowActions ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
      >
        {addingId === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        点歌
      </button>
    </div>
  );
}

export default memo(SongResultRow, (prev, next) => (
  prev.addingId === next.addingId
  && prev.alwaysShowActions === next.alwaysShowActions
  && prev.inQueue === next.inQueue
  && prev.played === next.played
  && prev.favorited === next.favorited
  && prev.onAdd === next.onAdd
  && songKey(prev.song) === songKey(next.song)
  && prev.song.name === next.song.name
  && prev.song.artist === next.song.artist
  && prev.song.album === next.song.album
  && prev.song.pic === next.song.pic
));
