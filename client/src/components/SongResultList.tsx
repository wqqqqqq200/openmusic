import { useState, useEffect } from 'react';
import { Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SearchResult } from '../types';
import { getCoverUrl, songKey } from '../api/music';
import SourceBadge from './SourceBadge';

const PAGE_SIZE = 7;

interface Props {
  results: SearchResult[];
  addingId: string | null;
  onAdd: (song: SearchResult) => void;
  keyword?: string;
}

export default function SongResultList({ results, addingId, onAdd, keyword }: Props) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [keyword]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (results.length === 0) return null;

  return (
    <div className="animate-slide-up">
      <div className="space-y-2">
        {pageResults.map((song) => (
          <div
            key={songKey(song)}
            className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-netease-card/80 group transition-colors cursor-pointer active:bg-netease-card/80"
            onDoubleClick={() => onAdd(song)}
            title="双击点歌"
          >
            <img
              src={getCoverUrl(song)}
              alt=""
              className="w-12 h-12 rounded-lg object-cover bg-netease-card flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect fill="%23333" width="48" height="48"/><text x="24" y="28" text-anchor="middle" fill="%23666" font-size="16">♪</text></svg>';
              }}
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium truncate">{song.name}</p>
              <p className="text-xs text-netease-muted truncate">
                {song.artist}
                {song.album ? ` · ${song.album}` : ''}
              </p>
            </div>
            <SourceBadge source={song.source} variant="muted" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(song);
              }}
              disabled={addingId === songKey(song)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-netease-red/10 text-netease-red text-xs font-medium opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-netease-red hover:text-white transition-all disabled:opacity-50 flex-shrink-0"
            >
              {addingId === songKey(song) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              点歌
            </button>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-netease-border/40">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-netease-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            上一页
          </button>
          <span className="text-xs text-netease-muted">
            {page} / {totalPages}
            <span className="text-netease-muted/50 ml-1">共 {results.length} 首</span>
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-netease-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            下一页
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
