import { useState, useEffect, useCallback } from 'react';

import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { Search, Loader2, Copy, Check, Crown, Tv, LogOut, X, Heart, Trash2, Plus, Download, ListMusic, Upload, History, ListPlus } from 'lucide-react';

import { searchAllSongs, getAvailableSources, type SearchFilterMode } from '../api/music';
import { importPlaylist, searchNeteasePlaylists, type NeteasePlaylistSearchItem, type PlaylistPlatform } from '../api/music/playlist';
import { rememberPlaylistImportHistory } from '../components/PlaylistImportModal';

import type { FavoriteSong, MusicSource, SearchResult, Song, SongHistoryItem } from '../types';

import type { MusicProviderMeta } from '../api/music/types';

import { useRoomStore } from '../stores/roomStore';

import { useSocket } from '../hooks/useSocket';
import { useFavorites } from '../hooks/useFavorites';
import { createRandomNickname } from '../lib/randomNickname';

import { songKey } from '../api/music';
import SongCover from '../components/SongCover';

import QueuePanel from '../components/QueuePanel';

import MiniPlayer from '../components/MiniPlayer';

import PlayerPage from '../components/PlayerPage';

import OnlineUsers from '../components/OnlineUsers';

import AudioEngine from '../components/AudioEngine';

import SongResultList from '../components/SongResultList';
import SourceBadge from '../components/SourceBadge';
import SearchFilterSelect from '../components/SearchFilterSelect';
import SearchSkeleton from '../components/SearchSkeleton';
import PlaylistImportModal from '../components/PlaylistImportModal';
import NeteaseToplistModal from '../components/NeteaseToplistModal';
import ChatPanel from '../components/ChatPanel';
import HotSongPanel from '../components/HotSongPanel';

import JumpRequestBanner from '../components/JumpRequestBanner';
import Toast from '../components/Toast';
import { copyToClipboard } from '../lib/copyToClipboard';
import { addSongsToQueue, formatBulkAddToast } from '../lib/addSongsToQueue';


function roomPasswordKey(roomId: string) {
  return `openmusic:room-password:${roomId.toUpperCase()}`;
}

function getStoredRoomPassword(roomId: string | undefined) {
  if (!roomId) return undefined;
  try {
    return sessionStorage.getItem(roomPasswordKey(roomId)) || undefined;
  } catch {
    return undefined;
  }
}

function rememberRoomPassword(roomId: string, password?: string) {
  if (!password?.trim()) return;
  try {
    sessionStorage.setItem(roomPasswordKey(roomId), password.trim());
  } catch {
    // sessionStorage may be unavailable in private browsing.
  }
}

function mapImportedSource(source: unknown): MusicSource {
  if (source === 'wy' || source === 'netease') return 'netease';
  if (source === 'qq' || source === 'tencent') return 'tencent';
  if (source === 'kugou') return 'kugou';
  return 'netease';
}

function normalizeImportedFavorite(raw: unknown): Song | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, any>;
  const id = String(item.id || item.mediaMid || '').trim();
  const name = String(item.name || '').trim();
  const artist = String(item.artist || item.album?.artist || '').trim();
  if (!id || !name) return null;
  return {
    id,
    source: mapImportedSource(item.source),
    name,
    artist: artist || '未知歌手',
    album: typeof item.album?.name === 'string' ? item.album.name : undefined,
    pic: String(item.pictureUrl || item.pic || item.album?.pictureUrl || '').trim() || undefined,
    duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : undefined,
    lrc: typeof item.lyric === 'string' ? item.lyric : undefined,
  };
}

function parseFavoriteImportJson(text: string): Song[] {
  const parsed = JSON.parse(text) as unknown;
  const rawItems = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown> || {});
  return rawItems.map(normalizeImportedFavorite).filter(Boolean) as Song[];
}

function chunkSongs<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function formatHistoryTime(time: number) {
  if (!time) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(time));
  } catch {
    return '';
  }
}

const PLAYLIST_SEARCH_PAGE_SIZE = 6;
const FAVORITES_IMPORT_BATCH_SIZE = 500;
type SearchMode = 'song' | 'playlist';


export default function Room() {

  const { roomId } = useParams<{ roomId: string }>();

  const navigate = useNavigate();

  const location = useLocation();

  const roomPassword = (location.state as { password?: string } | null)?.password || getStoredRoomPassword(roomId);

  const { room, showPlayer, setShowPlayer, isOwner, exitReason } = useRoomStore();

  const { joinRoom, addSong, leaveRoom, listFavorites, setFavorite, importFavorites } = useSocket();
  const { applyFavorites } = useFavorites();



  const [sources, setSources] = useState<MusicProviderMeta[]>([]);

  const [query, setQuery] = useState('');

  const [results, setResults] = useState<SearchResult[]>([]);

  const [searching, setSearching] = useState(false);

  const [joinError, setJoinError] = useState('');

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [listPageSongs, setListPageSongs] = useState<SearchResult[]>([]);

  const [copied, setCopied] = useState(false);
  const [tvCopied, setTvCopied] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('song');
  const [searchFilterMode, setSearchFilterMode] = useState<SearchFilterMode>('smart');
  const [playlistImportOpen, setPlaylistImportOpen] = useState(false);
  const [neteaseToplistOpen, setNeteaseToplistOpen] = useState(false);
  const [isPlaylistResults, setIsPlaylistResults] = useState(false);
  const [playlistSearchResults, setPlaylistSearchResults] = useState<NeteasePlaylistSearchItem[]>([]);
  const [playlistSearchPage, setPlaylistSearchPage] = useState(1);
  const [playlistSearchTotal, setPlaylistSearchTotal] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hotRefreshKey, setHotRefreshKey] = useState(0);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [songHistoryOpen, setSongHistoryOpen] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteSong[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState('');
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
  const [importingFavorites, setImportingFavorites] = useState(false);
  const [favoritesImportProgress, setFavoritesImportProgress] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const filteredFavorites = favorites.filter((song) => {
    const keyword = favoriteQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [song.name, song.artist, song.album, song.lrc].some((value) => String(value || '').toLowerCase().includes(keyword));
  });

  const openFavorites = useCallback(async () => {
    setFavoritesOpen(true);
    setFavoritesLoading(true);
    const res = await listFavorites();
    setFavoritesLoading(false);
    if (res.success) {
      const next = res.favorites || [];
      setFavorites(next);
      applyFavorites(next);
    } else {
      showToast(res.error || '收藏列表加载失败', 'error');
    }
  }, [listFavorites, showToast, applyFavorites]);

  const removeFavorite = useCallback(async (song: FavoriteSong) => {
    const key = songKey(song);
    setRemovingFavoriteId(key);
    const res = await setFavorite(song, false);
    setRemovingFavoriteId(null);
    if (res.success) {
      const next = res.favorites || [];
      setFavorites(next);
      applyFavorites(next);
      showToast('已取消收藏', 'success');
    } else {
      showToast(res.error || '取消收藏失败', 'error');
    }
  }, [setFavorite, showToast, applyFavorites]);

  const handleImportFavoritesJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImportingFavorites(true);
      setFavoritesImportProgress('');
      try {
        const songs = parseFavoriteImportJson(await file.text());
        if (songs.length === 0) {
          showToast('JSON 中没有可导入的歌曲', 'error');
          return;
        }
        const batches = chunkSongs(songs, FAVORITES_IMPORT_BATCH_SIZE);
        let imported = 0;
        let dropped = 0;
        let maxFavorites = 5000;
        for (let index = 0; index < batches.length; index += 1) {
          setFavoritesImportProgress(`导入进度 ${Math.min((index + 1) * FAVORITES_IMPORT_BATCH_SIZE, songs.length)}/${songs.length}`);
          const res = await importFavorites(batches[index]);
          if (!res.success) {
            showToast(res.error || `导入到 ${index * FAVORITES_IMPORT_BATCH_SIZE}/${songs.length} 时失败`, 'error');
            return;
          }
          imported += res.imported || 0;
          dropped = Math.max(dropped, res.dropped || 0);
          if (res.maxFavorites) maxFavorites = res.maxFavorites;
          if (res.favorites) {
            setFavorites(res.favorites);
            applyFavorites(res.favorites);
          }
        }
        if (dropped > 0) {
          showToast(`已导入 ${imported} 首新收藏，${dropped} 首因超出 ${maxFavorites} 首上限未导入`, 'success');
        } else {
          showToast(`已导入 ${imported} 首新收藏，重复歌曲已跳过`, 'success');
        }
      } catch {
        showToast('JSON 解析失败，请检查文件格式', 'error');
      } finally {
        setImportingFavorites(false);
        setFavoritesImportProgress('');
      }
    };
    input.click();
  }, [importFavorites, showToast, applyFavorites]);

  const handleExportFavoritesJson = useCallback(() => {
    const data = Object.fromEntries(favorites.map((song) => [
      `${song.source}:${song.id}`,
      {
        id: song.id,
        source: song.source,
        name: song.name,
        artist: song.artist,
        album: song.album || '',
        pic: song.pic || '',
        duration: song.duration || 0,
        lrc: song.lrc || '',
        favoritedAt: song.favoritedAt || Date.now(),
      },
    ]));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openmusic-favorites-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [favorites]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let redirectTimer: number | undefined;

    let nick = useRoomStore.getState().nickname.trim();
    if (!nick) {
      nick = createRandomNickname();
      useRoomStore.getState().setNickname(nick);
    }

    joinRoom(roomId, nick, roomPassword).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setJoinError(res.error || '加入房间失败');
        redirectTimer = window.setTimeout(() => navigate('/'), 2000);
        return;
      }

      rememberRoomPassword(roomId, roomPassword);
    });

    return () => {
      cancelled = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
      // 刷新/关闭页面时不主动 leave，避免房间被暂停；依赖 socket 断开与重连
    };
  }, [roomId, roomPassword, joinRoom, leaveRoom, navigate]);

  useEffect(() => {
    if (!exitReason) return;
    const redirectTimer = window.setTimeout(() => navigate('/'), 2500);
    return () => window.clearTimeout(redirectTimer);
  }, [exitReason, navigate]);

  useEffect(() => {
    getAvailableSources().then(setSources);
  }, []);

  const doSearch = useCallback(async (keyword: string, filterMode = searchFilterMode) => {

    if (!keyword.trim()) {

      setResults([]);

      return;

    }

    setSearching(true);

    try {

      const songs = await searchAllSongs(keyword, sources, { filterMode });

      setResults(songs);

    } catch {

      setResults([]);

    } finally {

      setSearching(false);

    }

  }, [sources, searchFilterMode]);

  const handleSearchFilterChange = useCallback((next: SearchFilterMode) => {
    if (isPlaylistResults) return;
    setSearchFilterMode(next);
    if (searchedKeyword.trim()) {
      doSearch(searchedKeyword, next);
    }
  }, [isPlaylistResults, searchedKeyword, doSearch]);

  const doPlaylistSearch = useCallback(async (keyword: string, page = 1) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setPlaylistSearchResults([]);
      setPlaylistSearchTotal(0);
      return;
    }
    setSearching(true);
    setIsPlaylistResults(false);
    setResults([]);
    try {
      const data = await searchNeteasePlaylists(trimmed, page, PLAYLIST_SEARCH_PAGE_SIZE);
      setPlaylistSearchResults(data.playlists);
      setPlaylistSearchPage(data.page);
      setPlaylistSearchTotal(data.total);
    } catch (err) {
      setPlaylistSearchResults([]);
      setPlaylistSearchTotal(0);
      showToast(err instanceof Error ? err.message : '歌单搜索失败', 'error');
    } finally {
      setSearching(false);
    }
  }, [showToast]);

  const handlePlaylistImport = useCallback(async (platform: PlaylistPlatform, input: string) => {
    setPlaylistImportOpen(false);
    setSearching(true);
    setIsPlaylistResults(true);
    setSearchMode('song');
    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword(`正在解析${platform === 'netease' ? '网易云' : 'QQ音乐'}歌单…`);
    setResults([]);

    try {
      const result = await importPlaylist(platform, input);
      if (result.playlistId) {
        rememberPlaylistImportHistory({ platform, playlistId: result.playlistId, name: result.name });
      }
      setResults(result.songs);
      setSearchedKeyword(`歌单：${result.name}`);

      if (result.songs.length === 0) {
        showToast('歌单为空或歌曲无法解析', 'error');
      } else if (result.failed && result.failed > 0) {
        showToast(`已解析 ${result.songs.length} 首，${result.failed} 首失败，请自选点歌`, 'success');
      } else {
        showToast(`已解析 ${result.songs.length} 首，请在结果中自选点歌`, 'success');
      }
    } catch (err) {
      setResults([]);
      setSearchedKeyword('');
      setIsPlaylistResults(false);
      showToast(err instanceof Error ? err.message : '歌单解析失败', 'error');
    } finally {
      setSearching(false);
    }
  }, [showToast]);

  const handleSearch = useCallback(() => {
    const keyword = query.trim();
    if (searchMode === 'playlist') {
      setSearchedKeyword(keyword);
      setIsPlaylistResults(false);
      void doPlaylistSearch(keyword, 1);
      return;
    }
    setIsPlaylistResults(false);
    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword(keyword);
    doSearch(keyword);
  }, [query, searchMode, doPlaylistSearch, doSearch]);

  const clearSearchResults = useCallback(() => {
    setQuery('');
    setResults([]);
    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword('');
    setIsPlaylistResults(false);
    setListPageSongs([]);
  }, []);

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
      setHotRefreshKey((k) => k + 1);
    } else if (res.error) {
      showToast(res.error, 'error');
    }
  };

  const handleListPageResultsChange = useCallback((songs: SearchResult[]) => {
    setListPageSongs(songs);
  }, []);

  const handleAddMany = useCallback(async (songs: SearchResult[]) => {
    if (addingPage || songs.length === 0) return;
    setAddingPage(true);
    try {
      const result = await addSongsToQueue(songs, {
        getRoom: () => useRoomStore.getState().room,
        addSong,
      });
      const toast = formatBulkAddToast(result);
      showToast(toast.message, toast.type);
      if (result.added > 0) setHotRefreshKey((k) => k + 1);
    } finally {
      setAddingPage(false);
    }
  }, [addingPage, addSong, showToast]);

  const handleAddCurrentPage = useCallback(() => {
    void handleAddMany(listPageSongs);
  }, [handleAddMany, listPageSongs]);



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

  if (exitReason) {

    return (

      <div className="min-h-full flex items-center justify-center px-6 text-center">

        <p className="text-netease-red">{exitReason}，正在返回...</p>

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
  const qqImportEnabled = sources.some((s) => s.id === 'tencent' && s.supportsSearch);
  const queueCount = (room.current ? 1 : 0) + room.queue.length;
  const showDesktopSearchOverlay = Boolean(searchedKeyword || searching);
  const showPlaylistSearch = searchMode === 'playlist' && Boolean(searchedKeyword || searching);
  const hasPlaylistSearchResults = showPlaylistSearch && playlistSearchResults.length > 0;
  const showPlaylistEmpty = showPlaylistSearch && !searching && playlistSearchResults.length === 0;
  const playlistSearchTotalPages = Math.max(1, Math.ceil(playlistSearchTotal / PLAYLIST_SEARCH_PAGE_SIZE));

  const renderResultsSummary = () => {
    if (searching) {
      if (showPlaylistSearch) return `正在搜索歌单「${searchedKeyword}」...`;
      return isPlaylistResults ? searchedKeyword : `正在搜索「${searchedKeyword}」...`;
    }
    if (hasPlaylistSearchResults) return `找到 ${playlistSearchTotal || playlistSearchResults.length} 个相关歌单`; 
    if (results.length === 0) {
      if (showPlaylistSearch) return '没有找到相关歌单';
      return isPlaylistResults ? '歌单为空或链接无效' : `「${searchedKeyword}」无相关结果`;
    }
    if (isPlaylistResults) {
      const name = searchedKeyword.replace(/^歌单：/, '');
      return `「${name}」共 ${results.length} 首，请自选点歌`;
    }
    return `找到 ${results.length} 首相关歌曲`;
  };

  const showSongListResults = Boolean(
    !searching && searchedKeyword && !showPlaylistSearch && results.length > 0,
  );

  const renderBulkAddPageButton = (className = '') => (
    <button
      type="button"
      onClick={handleAddCurrentPage}
      disabled={addingPage || listPageSongs.length === 0}
      className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-netease-red transition-colors hover:bg-netease-red/10 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {addingPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
      一键点歌本页
    </button>
  );

  const renderQueueSection = (fillHeight = false) => (
    <div
      className={`bg-netease-card/30 border border-netease-border/50 rounded-2xl overflow-hidden flex flex-col ${
        fillHeight ? 'h-full flex-1 min-h-0' : 'flex-shrink-0'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-netease-border/50 flex-shrink-0">
        <h2 className="text-sm font-medium">播放队列</h2>
        <span className="text-xs text-netease-muted">
          {queueCount > 0 ? `共 ${queueCount} 首` : '暂无歌曲'}
        </span>
      </div>
      <div className={`p-2 ${fillHeight ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : ''}`}>
        <QueuePanel fillHeight={fillHeight} />
      </div>
    </div>
  );

  const searchBar = (
    <div className="flex gap-2 mb-2">
      <div className="flex flex-shrink-0 overflow-hidden rounded-xl border border-netease-border bg-netease-card p-1 sm:rounded-2xl" title="搜索类型">
        {([
          ['song', '歌曲'],
          ['playlist', '歌单'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSearchMode(mode)}
            className={`rounded-lg px-2.5 py-2 text-xs transition-colors sm:px-3 sm:py-2.5 sm:text-sm ${
              searchMode === mode ? 'bg-netease-red text-white shadow-sm' : 'text-netease-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-netease-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={searchMode === 'playlist' ? '搜索网易云歌单...' : '搜索歌曲、歌手...'}
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
  );

  const playlistSearchList = (
    <div className="animate-slide-up">
      <div className="space-y-2">
        {playlistSearchResults.map((playlist) => (
          <div key={playlist.id} className="group flex items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 sm:gap-3 sm:p-3">
            <img
              src={playlist.coverImgUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect fill="%23333" width="48" height="48"/><text x="24" y="28" text-anchor="middle" fill="%23666" font-size="16">♪</text></svg>'}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-medium">{playlist.name}</p>
              <p className="truncate text-xs text-netease-muted">{playlist.creatorName || '网易云歌单'} · {playlist.trackCount} 首</p>
            </div>
            <SourceBadge source="netease" variant="muted" />
            <button
              type="button"
              onClick={() => handlePlaylistImport('netease', playlist.id)}
              disabled={searching}
              className="flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50"
            >
              <ListMusic className="h-4 w-4" />
              查看
            </button>
          </div>
        ))}
      </div>
      {playlistSearchTotalPages > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-netease-border/40 pt-4">
          <button type="button" disabled={playlistSearchPage <= 1 || searching} onClick={() => void doPlaylistSearch(searchedKeyword, playlistSearchPage - 1)} className="rounded-lg px-3 py-1.5 text-sm text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30">上一页</button>
          <span className="text-xs text-netease-muted">{playlistSearchPage} / {playlistSearchTotalPages}<span className="ml-1 text-netease-muted/50">共 {playlistSearchTotal} 个</span></span>
          <button type="button" disabled={playlistSearchPage >= playlistSearchTotalPages || searching} onClick={() => void doPlaylistSearch(searchedKeyword, playlistSearchPage + 1)} className="rounded-lg px-3 py-1.5 text-sm text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30">下一页</button>
        </div>
      )}
    </div>
  );



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

        <div className="max-w-7xl mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center justify-between gap-2 min-w-0">

            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <h1 className="text-base sm:text-lg font-semibold truncate">

                  <span className="truncate">{room.name}</span>

                </h1>

                {isOwner && (

                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">

                    <Crown className="w-3 h-3" />

                    房主

                  </span>

                )}

              </div>

              <p className="text-xs text-netease-muted mt-0.5">
                房间号 <span className="text-netease-red">{room.id}</span>
              </p>

              <p className="text-xs text-netease-muted">{room.userCount} 人在线</p>

            </div>

            <div className="sm:hidden flex-shrink-0">

              <OnlineUsers
                users={room.users}
                ownerId={room.ownerId}
                creatorId={room.creatorId}
                onNotice={showToast}
              />

            </div>

          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">

            <div className="flex items-center gap-1 sm:gap-2">

              <button

                onClick={handleCopyTvLink}

                className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"

                title="TV歌词"

              >

                {tvCopied ? <Check className="w-4 h-4 text-green-400" /> : <Tv className="w-4 h-4" />}

                <span className="hidden sm:inline">{tvCopied ? '已复制' : 'TV歌词'}</span>

              </button>

              <button

                onClick={handleCopyRoom}

                className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"

                title="分享房间"

              >

                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}

                <span className="hidden sm:inline">{copied ? '已复制' : '分享房间'}</span>

              </button>

              <button
                onClick={() => {
                  leaveRoom();
                  navigate('/');
                }}
                className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"
                title="退出房间"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">退出房间</span>
              </button>

            </div>

            <div className="hidden sm:block">

              <OnlineUsers
                users={room.users}
                ownerId={room.ownerId}
                creatorId={room.creatorId}
                onNotice={showToast}
              />

            </div>

          </div>

        </div>

      </header>



      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-3 sm:px-4 pt-3 sm:pt-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] overflow-y-auto lg:overflow-hidden">

        <div className="flex flex-col lg:grid lg:grid-cols-[240px_1fr_300px] lg:h-full lg:min-h-0 gap-3 lg:gap-4">

          {/* 点歌热榜 — 桌面左侧 */}
          <div className="hidden lg:flex flex-col order-0 lg:min-h-0 lg:overflow-hidden">
            <HotSongPanel addingId={addingId} onAdd={handleAdd} refreshKey={hotRefreshKey} />
          </div>

          {/* 点歌搜索 — 中间；手机端热榜在上方 */}
          <div className="min-w-0 order-1 flex flex-col lg:min-h-0 lg:h-full lg:overflow-hidden">
            <div className="lg:hidden mb-3">
              <HotSongPanel compact addingId={addingId} onAdd={handleAdd} refreshKey={hotRefreshKey} />
            </div>

            <div className="flex-shrink-0">
              <JumpRequestBanner />
              {searchBar}
              {searchableCount > 0 && (
                <div className="mb-2 flex items-center justify-between gap-2 px-1 sm:mb-4">
                  <button
                    type="button"
                    onClick={() => setNeteaseToplistOpen(true)}
                    className="rounded-lg px-2 py-1 text-[11px] sm:text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                  >
                    网易云热榜
                  </button>
                  <div className="flex min-w-0 flex-shrink-0 items-center gap-1 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setSongHistoryOpen(true)}
                      className="rounded-lg px-2 py-1 text-[11px] sm:text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                    >
                      点歌历史
                    </button>
                    <button
                      type="button"
                      onClick={openFavorites}
                      className="rounded-lg px-2 py-1 text-[11px] sm:text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                    >
                      我的收藏
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaylistImportOpen(true)}
                      className="rounded-lg px-2 py-1 text-[11px] sm:text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                    >
                      导入歌单
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 桌面：播放队列撑满剩余高度，底部与热榜对齐 */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col mt-1">
              {renderQueueSection(true)}
            </div>

            {/* 手机：搜索结果内联展示（保持原样） */}
            <div className="lg:hidden">
              {searching && searchedKeyword && (
                <div className="max-h-56 overflow-hidden rounded-xl">
                  <SearchSkeleton />
                </div>
              )}

              {!searching && searchedKeyword && (
                <div className="flex items-center justify-between mb-2 px-1 gap-2">
                  <span className="text-xs text-netease-muted min-w-0 truncate">
                    {renderResultsSummary()}
                  </span>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {searchableCount > 0 && !isPlaylistResults && (
                      searchMode === 'song' && <SearchFilterSelect value={searchFilterMode} onChange={handleSearchFilterChange} />
                    )}
                    {showSongListResults && renderBulkAddPageButton()}
                    <button
                      type="button"
                      onClick={clearSearchResults}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-netease-muted hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      清空
                    </button>
                  </div>
                </div>
              )}

              {!searching && searchedKeyword && !hasPlaylistSearchResults && results.length === 0 && (
                <p className="text-center text-netease-muted py-4 sm:py-6 animate-fade-in">
                  {showPlaylistEmpty ? '没有找到相关歌单' : (isPlaylistResults ? '歌单为空或链接无效' : '换个关键词试试')}
                </p>
              )}

              {!searching && hasPlaylistSearchResults && playlistSearchList}

              {!searching && searchedKeyword && (
                !showPlaylistSearch && (
                <SongResultList
                  results={results}
                  addingId={addingId}
                  onAdd={handleAdd}
                  keyword={searchedKeyword}
                  onPageResultsChange={handleListPageResultsChange}
                />
                )
              )}
            </div>
          </div>

          {/* 右侧：桌面仅聊天室；手机保持队列 + 聊天 */}
          <div className="order-2 flex flex-col gap-3 lg:self-stretch lg:min-h-0">
            <div className="lg:hidden">
              {renderQueueSection()}
            </div>

            <div className="flex-shrink-0 h-[300px] sm:h-[320px] lg:flex-1 lg:min-h-0 lg:h-auto">
              <ChatPanel />
            </div>
          </div>

        </div>

      </div>

      {/* 桌面：搜索结果弹层 */}
      {showDesktopSearchOverlay && (
        <div className="hidden lg:flex fixed inset-0 z-50 items-start justify-center px-4 pt-24 pb-8">
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/65 backdrop-blur-sm"
            onClick={clearSearchResults}
            aria-label="关闭搜索结果"
          />
          <div
            className="relative z-10 w-full max-w-2xl max-h-[min(72vh,680px)] flex flex-col glass rounded-2xl border border-white/10 shadow-2xl animate-fade-in overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-netease-border/50 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-white">{isPlaylistResults ? '歌单' : '搜索结果'}</h2>
                <p className="text-xs text-netease-muted mt-0.5 truncate">
                  {renderResultsSummary()}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {!searching && searchableCount > 0 && !isPlaylistResults && (
                  searchMode === 'song' && <SearchFilterSelect value={searchFilterMode} onChange={handleSearchFilterChange} />
                )}
                {showSongListResults && renderBulkAddPageButton('px-2.5 py-1.5')}
                <button
                  type="button"
                  onClick={clearSearchResults}
                  className="flex-shrink-0 rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className={`flex-1 min-h-0 p-3 ${searching ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              {searching && searchedKeyword && <SearchSkeleton />}
              {!searching && searchedKeyword && !hasPlaylistSearchResults && results.length === 0 && (
                <p className="text-center text-netease-muted py-10 animate-fade-in">
                  {showPlaylistEmpty ? '没有找到相关歌单' : (isPlaylistResults ? '歌单为空或链接无效' : '换个关键词试试')}
                </p>
              )}
              {!searching && hasPlaylistSearchResults && playlistSearchList}
              {!searching && searchedKeyword && (
                !showPlaylistSearch && (
                <SongResultList
                  results={results}
                  addingId={addingId}
                  onAdd={handleAdd}
                  keyword={searchedKeyword}
                  alwaysShowActions
                  onPageResultsChange={handleListPageResultsChange}
                />
                )
              )}
            </div>
          </div>
        </div>
      )}

      {playlistImportOpen && (
        <PlaylistImportModal
          open={playlistImportOpen}
          loading={searching}
          qqImportEnabled={qqImportEnabled}
          onClose={() => setPlaylistImportOpen(false)}
          onImport={handlePlaylistImport}
        />
      )}

      {songHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24 pb-8">
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setSongHistoryOpen(false)} aria-label="关闭点歌历史" />
          <div className="relative z-10 flex max-h-[min(72vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl">
            <div className="flex items-center justify-between border-b border-netease-border/50 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-white">点歌历史</h2>
                <p className="mt-0.5 text-xs text-netease-muted">最近 {room.songHistory?.length || 0} 首，可直接复播</p>
              </div>
              <button type="button" onClick={() => setSongHistoryOpen(false)} className="rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!room.songHistory?.length ? (
                <div className="py-16 text-center text-sm text-netease-muted">
                  <History className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  暂无点歌历史
                </div>
              ) : (
                <div className="space-y-2">
                  {room.songHistory.map((song: SongHistoryItem, index: number) => {
                    const key = songKey(song);
                    return (
                      <div key={`${song.requestedAt}-${key}-${index}`} className="group flex items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 sm:gap-3 sm:p-3">
                        <SongCover song={song} className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-medium">{song.name}</p>
                            <SourceBadge source={song.source} variant="muted" />
                          </div>
                          <p className="truncate text-xs text-netease-muted">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                          <p className="truncate text-[11px] text-netease-muted/80">{song.requestedBy || '匿名'} 点歌{formatHistoryTime(song.requestedAt) ? ` · ${formatHistoryTime(song.requestedAt)}` : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAdd(song as SearchResult)}
                          disabled={addingId === key}
                          className="flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50"
                        >
                          {addingId === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          复播
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {favoritesOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24 pb-8">
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setFavoritesOpen(false)} aria-label="关闭收藏" />
          <div className="relative z-10 flex max-h-[min(72vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl">
            <div className="flex items-center justify-between border-b border-netease-border/50 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-white">我的收藏</h2>
                <p className="mt-0.5 text-xs text-netease-muted">共 {favorites.length} 首，可直接点歌</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleImportFavoritesJson}
                  disabled={importingFavorites}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-netease-muted hover:bg-white/10 hover:text-white disabled:opacity-50"
                  title="导入收藏 JSON"
                >
                  {importingFavorites ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {favoritesImportProgress || '导入JSON'}
                </button>
                <button
                  type="button"
                  onClick={handleExportFavoritesJson}
                  disabled={favorites.length === 0 || importingFavorites}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-netease-muted hover:bg-white/10 hover:text-white disabled:opacity-50"
                  title="导出收藏 JSON"
                >
                  <Upload className="h-4 w-4" />
                  导出JSON
                </button>
                <button type="button" onClick={() => setFavoritesOpen(false)} className="rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-netease-muted" />
                <input
                  type="text"
                  value={favoriteQuery}
                  onChange={(event) => setFavoriteQuery(event.target.value)}
                  placeholder="搜索收藏歌名、歌手..."
                  className="w-full rounded-xl border border-netease-border bg-netease-dark py-2 pl-9 pr-3 text-sm text-white placeholder:text-netease-muted/50 focus:border-netease-red/50 focus:outline-none"
                />
              </div>
              {favoritesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-netease-red" /></div>
              ) : filteredFavorites.length === 0 ? (
                <div className="py-16 text-center text-sm text-netease-muted">
                  <Heart className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {favorites.length === 0 ? '暂无收藏歌曲' : '没有匹配的收藏歌曲'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFavorites.map((song) => {
                    const key = songKey(song);
                    return (
                      <div key={key} className="group flex items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 sm:gap-3 sm:p-3">
                        <SongCover song={song} className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-sm font-medium">{song.name}</p>
                          <p className="truncate text-xs text-netease-muted">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                        </div>
                        <SourceBadge source={song.source} variant="muted" />
                        <button
                          type="button"
                          onClick={() => void removeFavorite(song)}
                          disabled={removingFavoriteId === key}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-netease-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                          title="取消收藏"
                        >
                          {removingFavoriteId === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdd(song as SearchResult)}
                          disabled={addingId === key}
                          className="flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50"
                        >
                          {addingId === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          点歌
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {neteaseToplistOpen && (
        <NeteaseToplistModal
          open={neteaseToplistOpen}
          addingId={addingId}
          onClose={() => setNeteaseToplistOpen(false)}
          onAdd={handleAdd}
        />
      )}



      {room.current ? (

        <MiniPlayer onExpand={() => setShowPlayer(true)} />

      ) : room.randomLoading ? (

        <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-netease-border/50 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="max-w-5xl mx-auto flex items-center gap-3 px-3 sm:px-4 py-3.5 sm:py-4">
            <Loader2 className="w-5 h-5 text-netease-red animate-spin flex-shrink-0" />
            <p className="text-sm text-netease-muted">正在加载随机歌曲...</p>
          </div>
        </div>

      ) : null}



      {showPlayer && room.current && (

        <PlayerPage onClose={() => setShowPlayer(false)} />

      )}

    </div>

  );

}
