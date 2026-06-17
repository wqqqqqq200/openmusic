import { useState, useEffect, useCallback } from 'react';

import { useParams, useNavigate } from 'react-router-dom';

import { Search, Loader2, Copy, Check, Crown, Tv } from 'lucide-react';

import { searchAllSongs, getAvailableSources } from '../api/music';

import type { SearchResult } from '../types';

import type { MusicProviderMeta } from '../api/music/types';

import { useRoomStore } from '../stores/roomStore';

import { useSocket } from '../hooks/useSocket';

import { songKey } from '../api/music';

import QueuePanel from '../components/QueuePanel';

import MiniPlayer from '../components/MiniPlayer';

import PlayerPage from '../components/PlayerPage';

import OnlineUsers from '../components/OnlineUsers';

import AudioEngine from '../components/AudioEngine';

import SongResultList from '../components/SongResultList';
import SearchSkeleton from '../components/SearchSkeleton';
import ChatPanel from '../components/ChatPanel';

import JumpRequestBanner from '../components/JumpRequestBanner';
import Toast from '../components/Toast';
import { copyToClipboard } from '../lib/copyToClipboard';



export default function Room() {

  const { roomId } = useParams<{ roomId: string }>();

  const navigate = useNavigate();

  const { nickname, room, showPlayer, setShowPlayer, isOwner } = useRoomStore();

  const { joinRoom, addSong } = useSocket();



  const [sources, setSources] = useState<MusicProviderMeta[]>([]);

  const [query, setQuery] = useState('');

  const [results, setResults] = useState<SearchResult[]>([]);

  const [searching, setSearching] = useState(false);

  const [joinError, setJoinError] = useState('');

  const [addingId, setAddingId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [tvCopied, setTvCopied] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [dedupeCrossSource, setDedupeCrossSource] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);



  useEffect(() => {

    getAvailableSources().then(setSources);

  }, []);



  useEffect(() => {

    if (!roomId) return;

    joinRoom(roomId, nickname).then((res) => {

      if (!res.success) {

        setJoinError(res.error || '加入房间失败');

        setTimeout(() => navigate('/'), 2000);

      }

    });

  }, [roomId, nickname, joinRoom, navigate]);



  const doSearch = useCallback(async (keyword: string, dedupe = dedupeCrossSource) => {

    if (!keyword.trim()) {

      setResults([]);

      return;

    }

    setSearching(true);

    try {

      const songs = await searchAllSongs(keyword, sources, { dedupeCrossSource: dedupe });

      setResults(songs);

    } catch {

      setResults([]);

    } finally {

      setSearching(false);

    }

  }, [sources, dedupeCrossSource]);

  const handleSearch = useCallback(() => {
    const keyword = query.trim();
    setSearchedKeyword(keyword);
    doSearch(keyword);
  }, [query, doSearch]);

  const handleAdd = async (song: SearchResult) => {
    const key = songKey(song);
    setAddingId(key);
    const res = await addSong({
      id: song.id,
      source: song.source,
      name: song.name,
      artist: song.artist,
      album: song.album,
      pic: song.pic,
      duration: song.duration,
      url: song.url,
      lrc: song.lrc,
    });
    setAddingId(null);
    if (res.success) {
      showToast('点歌成功', 'success');
    } else if (res.error) {
      showToast(res.error, 'error');
    }
  };



  const handleCopyRoom = async () => {
    const url = `${window.location.origin}/room/${room?.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('复制失败，请手动复制地址栏链接', 'error');
    }
  };

  const handleCopyTvLink = async () => {
    const url = `${window.location.origin}/tv/${room?.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setTvCopied(true);
      setTimeout(() => setTvCopied(false), 2000);
    } else {
      showToast('复制失败，请手动复制地址栏链接', 'error');
    }
  };



  if (joinError) {

    return (

      <div className="min-h-full flex items-center justify-center">

        <p className="text-netease-red">{joinError}，正在返回...</p>

      </div>

    );

  }



  if (!room) {

    return (

      <div className="min-h-full flex items-center justify-center">

        <Loader2 className="w-8 h-8 text-netease-red animate-spin" />

      </div>

    );

  }



  const searchableCount = sources.filter((s) => s.supportsSearch).length;



  return (

    <div className="h-full flex flex-col overflow-hidden">

      <AudioEngine />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}

      <header className="glass flex-shrink-0 z-30 border-b border-netease-border/50 px-3 sm:px-4 py-2.5 sm:py-3 safe-top">

        <div className="max-w-6xl mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center justify-between gap-2 min-w-0">

            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <h1 className="text-base sm:text-lg font-semibold truncate">

                  房间 <span className="text-netease-red">{room.id}</span>

                </h1>

                {isOwner && (

                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">

                    <Crown className="w-3 h-3" />

                    房主

                  </span>

                )}

              </div>

              <p className="text-xs text-netease-muted">{room.userCount} 人在线</p>

            </div>

            <div className="sm:hidden flex-shrink-0">

              <OnlineUsers users={room.users} ownerId={room.ownerId} />

            </div>

          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">

            <div className="flex items-center gap-1 sm:gap-2">

              <button

                onClick={handleCopyTvLink}

                className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"

                title="电视投屏"

              >

                {tvCopied ? <Check className="w-4 h-4 text-green-400" /> : <Tv className="w-4 h-4" />}

                <span className="hidden sm:inline">{tvCopied ? '已复制' : '电视投屏'}</span>

              </button>

              <button

                onClick={handleCopyRoom}

                className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"

                title="分享房间"

              >

                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}

                <span className="hidden sm:inline">{copied ? '已复制' : '分享房间'}</span>

              </button>

            </div>

            <div className="hidden sm:block">

              <OnlineUsers users={room.users} ownerId={room.ownerId} />

            </div>

          </div>

        </div>

      </header>



      <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full px-3 sm:px-4 pt-3 sm:pt-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] overflow-y-auto lg:overflow-hidden">

        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] lg:h-full lg:min-h-0 gap-3 lg:gap-6">

          {/* 点歌搜索 — 手机端最上 */}
          <div className="min-w-0 order-1 flex flex-col lg:min-h-0 lg:overflow-hidden">
            <JumpRequestBanner />

            <div className="flex gap-2 mb-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-netease-muted pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索歌曲、歌手..."
                  className="w-full bg-netease-card border border-netease-border rounded-xl sm:rounded-2xl pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 text-sm sm:text-base text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                className="flex-shrink-0 px-3.5 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-netease-red text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 sm:hidden" />}
                <span className="hidden sm:inline">搜索</span>
              </button>
            </div>

            {searchableCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-netease-muted mb-2 sm:mb-4 px-1">
                <p>
                  同时搜索 {sources.filter((s) => s.supportsSearch).map((s) => s.shortName).join('、')}
                </p>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white/70 transition-colors">
                  <input
                    type="checkbox"
                    checked={dedupeCrossSource}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setDedupeCrossSource(next);
                      if (searchedKeyword.trim()) {
                        doSearch(searchedKeyword, next);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-netease-border bg-netease-card text-netease-red focus:ring-netease-red/40 focus:ring-offset-0"
                  />
                  <span>跨平台去重</span>
                </label>
              </div>
            )}

            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
              {searching && searchedKeyword && (
                <SearchSkeleton />
              )}

              {!searching && searchedKeyword && results.length === 0 && (
                <p className="text-center text-netease-muted py-6 sm:py-8 animate-fade-in">没有找到相关歌曲</p>
              )}

              {!searching && (
                <SongResultList
                  results={results}
                  addingId={addingId}
                  onAdd={handleAdd}
                  keyword={searchedKeyword}
                />
              )}
            </div>
          </div>

          {/* 播放队列 + 聊天室 — 手机端在点歌下方 */}
          <div className="order-2 flex flex-col gap-3 lg:self-stretch lg:min-h-0">
            <div className="bg-netease-card/30 border border-netease-border/50 rounded-2xl overflow-hidden flex flex-col flex-shrink-0">
              <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-netease-border/50 flex-shrink-0">
                <h2 className="text-sm font-medium">播放队列</h2>
                <span className="text-xs text-netease-muted">
                  {(room.current ? 1 : 0) + room.queue.length > 0
                    ? `共 ${(room.current ? 1 : 0) + room.queue.length} 首`
                    : '暂无歌曲'}
                </span>
              </div>
              <div className="p-2">
                <QueuePanel />
              </div>
            </div>

            <div className="flex-shrink-0 h-[300px] sm:h-[320px] lg:flex-1 lg:min-h-0 lg:h-auto">
              <ChatPanel />
            </div>
          </div>

        </div>

      </div>



      {room.current && (

        <MiniPlayer onExpand={() => setShowPlayer(true)} />

      )}



      {showPlayer && room.current && (

        <PlayerPage onClose={() => setShowPlayer(false)} />

      )}

    </div>

  );

}


