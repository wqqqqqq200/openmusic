import { useState, useEffect } from 'react';
import { Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SearchResult } from '../types';
import { songKey } from '../api/music';
import SongCover from './SongCover';
import SongRowBadges from './SongRowBadges';
import FavoriteButton from './FavoriteButton';

const PAGE_SIZE = 6;

interface Props {
  results: SearchResult[];
  addingId: string | null;
  onAdd: (song: SearchResult) => void;
  keyword?: string;
  alwaysShowActions?: boolean;
  onPageResultsChange?: (songs: SearchResult[]) => void;
}

export default function SongResultList({
  results,
  addingId,
  onAdd,
  keyword,
  alwaysShowActions = false,
  onPageResultsChange,
}: Props) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [keyword]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => {
    onPageResultsChange?.(pageResults);
  }, [pageResults, onPageResultsChange]);

  if (results.length === 0) return null;

  return (
    <div className="animate-slide-up">
      <div className="space-y-2">
        {pageResults.map((song) => {
          const key = songKey(song);
          return (
            <div
              key={key}
              className="group flex cursor-pointer items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 active:bg-netease-card/80 sm:gap-3 sm:p-3"
              onDoubleClick={() => onAdd(song)}
              title="双击点歌"
            >
              <SongCover
                song={song}
                className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">{song.name}</p>
                <p className="truncate text-xs text-netease-muted">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
              </div>
              <SongRowBadges song={song} />
              <FavoriteButton
                song={song}
                showOnHover={!alwaysShowActions}
                className="w-7 h-7 text-netease-muted hover:text-rose-300"
                iconClassName="w-3.5 h-3.5"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onAdd(song); }}
                disabled={addingId === key}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50 ${alwaysShowActions ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
              >
                {addingId === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                点歌
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-netease-border/40 pt-4">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-4 w-4" />上一页</button>
        <span className="text-xs text-netease-muted">{page} / {totalPages}<span className="ml-1 text-netease-muted/50">共 {results.length} 首</span></span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30">下一页<ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
