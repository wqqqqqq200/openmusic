import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { Search, Loader2, Copy, Check, Crown, Tv, LogOut, X, Heart, Plus, Download, ListMusic, Upload, History, ListPlus, Pencil, Lock, LockOpen, Radio, ChevronLeft, ChevronRight, Megaphone, Music2, Ban, Image } from 'lucide-react';

import { searchAllSongs, getAvailableSources, type SearchFilterMode } from '../api/music';
import { importPlaylist, searchPlaylists, type PlaylistSearchItem, type PlaylistPlatform, type PlaylistChannelFilter as PlaylistChannelFilterMode } from '../api/music/playlist';
import { normalizeFmMode } from '../api/music/fmMode';
import { addSongsToQueue, formatBulkAddToast } from '../lib/addSongsToQueue';
import { rememberPlaylistImportHistory } from '../components/PlaylistImportModal';

import type { FavoriteSong, MusicSource, SearchResult, Song, SongHistoryItem } from '../types';

import type { MusicProviderMeta } from '../api/music/types';

import { useRoomStore } from '../stores/roomStore';

import { useSocket } from '../hooks/useSocket';
import { useFavorites } from '../hooks/useFavorites';
import { createRandomNickname } from '../lib/randomNickname';
import { usePageSeo } from '../lib/seo';

import { songKey } from '../api/music';
import SongCover from '../components/SongCover';

import QueuePanel from '../components/QueuePanel';

import MiniPlayer from '../components/MiniPlayer';

import RoomAmbientBackground from '../components/RoomAmbientBackground';

import PlayerPage from '../components/PlayerPage';

import OnlineUsers from '../components/OnlineUsers';

import AudioEngine from '../components/AudioEngine';

import SongResultList from '../components/SongResultList';
import SourceBadge from '../components/SourceBadge';
import SearchFilterSelect from '../components/SearchFilterSelect';
import PlaylistChannelFilter from '../components/PlaylistChannelFilter';
import PageNumberPagination from '../components/PageNumberPagination';
import SearchSkeleton, { RESULT_BODY_HEIGHT } from '../components/SearchSkeleton';
import {
  getStoredSongResultPageSize,
  setStoredSongResultPageSize,
  SONG_RESULT_PAGE_SIZE_OPTIONS,
  type SongResultPageSize,
} from '../lib/songResultPagination';
import PlaylistImportModal from '../components/PlaylistImportModal';
import ChatPanel from '../components/ChatPanel';
import HotSongPanel from '../components/HotSongPanel';
import RecommendedPlaylistsPanel from '../components/RecommendedPlaylistsPanel';
import FavoriteButton from '../components/FavoriteButton';
import PageSizeSelect from '../components/PageSizeSelect';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSongHistoryStore } from '../stores/songHistoryStore';

import RoomFmModeBadge from '../components/RoomFmModeBadge';
import RoomFmModeModal from '../components/RoomFmModeModal';
import RoomAnnouncementModal from '../components/RoomAnnouncementModal';
import RoomAnnouncementPopup from '../components/RoomAnnouncementPopup';
import { canRequestSong } from '../lib/roomPermissions';
import { markAnnouncementSeen, shouldAutoShowAnnouncement } from '../lib/announcementSeen';
import JumpRequestBanner from '../components/JumpRequestBanner';
import Toast from '../components/Toast';
import Tooltip from '../components/Tooltip';
import { copyToClipboard } from '../lib/copyToClipboard';
import { rememberRoomVisit } from '../lib/recentRooms';
import { buildRoomShareText } from '../lib/roomShare';
import { readRoomCoverBgEnabled, writeRoomCoverBgEnabled } from '../lib/roomCoverBg';


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

const FAVORITES_IMPORT_BATCH_SIZE = 500;
const FAVORITES_PAGE_SIZE_OPTIONS = [15, 30, 50] as const;
type FavoritesPageSize = (typeof FAVORITES_PAGE_SIZE_OPTIONS)[number];
const DEFAULT_FAVORITES_PAGE_SIZE: FavoritesPageSize = 15;
type SearchMode = 'song' | 'playlist';

interface PlaylistSearchBackup {
  keyword: string;
  results: PlaylistSearchItem[];
  page: number;
  total: number;
  channel: PlaylistChannelFilterMode;
  pageSize: SongResultPageSize;
}


export default function Room() {

  const { roomId } = useParams<{ roomId: string }>();

  const navigate = useNavigate();

  const location = useLocation();

  const roomPassword = (location.state as { password?: string } | null)?.password || getStoredRoomPassword(roomId);

  const { room, nickname, showPlayer, setShowPlayer, isOwner, isAdmin, canControlPlayback, mySocketId, exitReason } = useRoomStore();

  usePageSeo({
    title: room?.name ? `${room.name} 房间` : '正在加入房间',
    description: room?.current
      ? `正在播放「${room.current.name}」— 加入 ${room.name} 多人同步听歌、点歌、聊天`
      : '多人实时同步听歌、搜索点歌、歌词滚动、房间聊天',
    path: roomId ? `/room/${roomId}` : undefined,
    noindex: true,
  });

  const { joinRoom, addSong, leaveRoom, listFavorites, setFavorite, importFavorites, renameRoomName, setRoomLock, setRoomFmMode, setRoomAnnouncement, setSongRequestEnabled, loadSongHistory } = useSocket();
  const { applyFavorites } = useFavorites();



  const [sources, setSources] = useState<MusicProviderMeta[]>([]);

  const [query, setQuery] = useState('');

  const [results, setResults] = useState<SearchResult[]>([]);

  const [searching, setSearching] = useState(false);
  const [playlistSearchLoading, setPlaylistSearchLoading] = useState(false);

  const [joinError, setJoinError] = useState('');

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [listPageSongs, setListPageSongs] = useState<SearchResult[]>([]);

  const [copied, setCopied] = useState(false);
  const [tvCopied, setTvCopied] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('song');
  const [activeSearchMode, setActiveSearchMode] = useState<SearchMode>('song');
  const [overlaySearchMode, setOverlaySearchMode] = useState<SearchMode>('song');
  const [overlayQuery, setOverlayQuery] = useState('');
  const prevOverlayOpenRef = useRef(false);
  const [searchFilterMode, setSearchFilterMode] = useState<SearchFilterMode>('smart');
  const [playlistImportOpen, setPlaylistImportOpen] = useState(false);
  const [isPlaylistResults, setIsPlaylistResults] = useState(false);
  const [playlistSearchResults, setPlaylistSearchResults] = useState<PlaylistSearchItem[]>([]);
  const [playlistSearchPage, setPlaylistSearchPage] = useState(1);
  const [playlistSearchPageSize, setPlaylistSearchPageSize] = useState<SongResultPageSize>(getStoredSongResultPageSize);
  const [playlistSearchTotal, setPlaylistSearchTotal] = useState(0);
  const [playlistChannelFilter, setPlaylistChannelFilter] = useState<PlaylistChannelFilterMode>('all');
  const [playlistSearchBackup, setPlaylistSearchBackup] = useState<PlaylistSearchBackup | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hotRefreshKey, setHotRefreshKey] = useState(0);
  const [coverBgEnabled, setCoverBgEnabled] = useState(readRoomCoverBgEnabled);
  const isLgUp = useMediaQuery('(min-width: 1024px)');
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [songHistoryOpen, setSongHistoryOpen] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteSong[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState('');
  const [favoritePage, setFavoritePage] = useState(1);
  const [favoritePageSize, setFavoritePageSize] = useState<FavoritesPageSize>(DEFAULT_FAVORITES_PAGE_SIZE);
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
  const [addingAllFavorites, setAddingAllFavorites] = useState(false);
  const [importingFavorites, setImportingFavorites] = useState(false);
  const [favoritesImportProgress, setFavoritesImportProgress] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockSaving, setLockSaving] = useState(false);
  const [fmOpen, setFmOpen] = useState(false);
  const [fmSaving, setFmSaving] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementPopupOpen, setAnnouncementPopupOpen] = useState(false);
  const [songRequestSaving, setSongRequestSaving] = useState(false);
  const songHistoryItems = useSongHistoryStore((s) => s.songs);
  const songHistoryLoading = useSongHistoryStore((s) => s.loading);

  useEffect(() => {
    if (!songHistoryOpen || !room?.id) return;
    void loadSongHistory();
  }, [songHistoryOpen, room?.id, loadSongHistory]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const isCreator = Boolean(room?.creatorId && mySocketId && room.creatorId === mySocketId);
  const songRequestAllowed = canRequestSong(room, isOwner, isAdmin);

  const openRenameModal = useCallback(() => {
    if (!room) return;
    setRenameDraft(room.name);
    setRenameOpen(true);
  }, [room]);

  const handleRenameRoom = useCallback(async () => {
    const nextName = renameDraft.trim();
    if (!nextName || renameSaving) return;
    setRenameSaving(true);
    const res = await renameRoomName(nextName);
    setRenameSaving(false);
    if (res.success) {
      setRenameOpen(false);
      showToast('房间名称已更新', 'success');
    } else {
      showToast(res.error || '改名失败', 'error');
    }
  }, [renameDraft, renameSaving, renameRoomName, showToast]);

  const openLockModal = useCallback(() => {
    setLockPassword('');
    setLockOpen(true);
  }, []);

  const handleUnlockRoom = useCallback(async () => {
    if (lockSaving) return;
    setLockSaving(true);
    const res = await setRoomLock(false);
    setLockSaving(false);
    if (res.success) {
      setLockOpen(false);
      showToast('房间已解锁', 'success');
    } else {
      showToast(res.error || '解锁失败', 'error');
    }
  }, [lockSaving, setRoomLock, showToast]);

  const handleLockRoom = useCallback(async () => {
    if (lockSaving) return;
    setLockSaving(true);
    const res = await setRoomLock(true, lockPassword.trim() || undefined);
    setLockSaving(false);
    if (res.success) {
      setLockOpen(false);
      setLockPassword('');
      showToast(lockPassword.trim() ? '房间已上锁（需密码进入）' : '房间已上锁（禁止进入）', 'success');
    } else {
      showToast(res.error || '上锁失败', 'error');
    }
  }, [lockPassword, lockSaving, setRoomLock, showToast]);

  const filteredFavorites = favorites.filter((song) => {
    const keyword = favoriteQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [song.name, song.artist, song.album, song.lrc].some((value) => String(value || '').toLowerCase().includes(keyword));
  });

  const favoriteTotalPages = Math.max(1, Math.ceil(filteredFavorites.length / favoritePageSize));
  const pagedFavorites = filteredFavorites.slice(
    (favoritePage - 1) * favoritePageSize,
    favoritePage * favoritePageSize,
  );

  useEffect(() => {
    setFavoritePage(1);
  }, [favoriteQuery, favorites.length, favoritePageSize]);

  useEffect(() => {
    if (favoritePage > favoriteTotalPages) {
      setFavoritePage(favoriteTotalPages);
    }
  }, [favoritePage, favoriteTotalPages]);

  const openFavorites = useCallback(async () => {
    setFavoritesOpen(true);
    setFavoritePage(1);
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

  const handleAddAllFavorites = useCallback(async () => {
    if (addingAllFavorites || filteredFavorites.length === 0) return;
    setAddingAllFavorites(true);
    try {
      const result = await addSongsToQueue(filteredFavorites, {
        getRoom: () => useRoomStore.getState().room,
        addSong,
      });
      const toast = formatBulkAddToast(result);
      showToast(toast.message, toast.type);
      if (result.added > 0) setHotRefreshKey((k) => k + 1);
    } finally {
      setAddingAllFavorites(false);
    }
  }, [addingAllFavorites, filteredFavorites, addSong, showToast]);

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
      rememberRoomVisit(roomId);
      if (
        res.room
        && shouldAutoShowAnnouncement(res.room.id, res.room.announcementEnabled, res.room.announcementText)
      ) {
        setAnnouncementPopupOpen(true);
      }
    });

    return () => {
      cancelled = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
      // 刷新/关闭页面时不主动 leave，避免房间被暂停；依赖 socket 断开与重连
    };
  }, [roomId, roomPassword, joinRoom, leaveRoom, navigate]);

  useEffect(() => {
    if (!room?.id) return;
    if (shouldAutoShowAnnouncement(room.id, room.announcementEnabled, room.announcementText)) {
      setAnnouncementPopupOpen(true);
    }
  }, [room?.id, room?.announcementEnabled, room?.announcementText]);

  useEffect(() => {
    if (!exitReason) return;
    const redirectTimer = window.setTimeout(() => navigate('/'), 2500);
    return () => window.clearTimeout(redirectTimer);
  }, [exitReason, navigate]);

  useEffect(() => {
    getAvailableSources().then(setSources);
  }, []);

  useEffect(() => {
    if (!isLgUp) return;
    const overlayOpen = Boolean(searchedKeyword || searching || playlistSearchLoading);
    if (overlayOpen && !prevOverlayOpenRef.current) {
      setOverlaySearchMode(activeSearchMode);
      const fromSearched = searchedKeyword.trim();
      let keyword = '';
      if (fromSearched.startsWith('歌单：')) {
        keyword = playlistSearchBackup?.keyword.trim() || '';
      } else if (!fromSearched.startsWith('正在')) {
        keyword = fromSearched;
      } else {
        keyword = query.trim();
      }
      setOverlayQuery(keyword);
    }
    prevOverlayOpenRef.current = overlayOpen;
  }, [isLgUp, activeSearchMode, searchedKeyword, searching, playlistSearchLoading, playlistSearchBackup, query]);

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

  const doPlaylistSearch = useCallback(async (
    keyword: string,
    page = 1,
    channel = playlistChannelFilter,
    limit = playlistSearchPageSize,
  ) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setPlaylistSearchResults([]);
      setPlaylistSearchTotal(0);
      return;
    }
    setPlaylistSearchLoading(true);
    setIsPlaylistResults(false);
    setResults([]);
    try {
      const data = await searchPlaylists(trimmed, page, limit, channel);
      setPlaylistSearchResults(data.playlists);
      setPlaylistSearchPage(data.page);
      setPlaylistSearchTotal(data.total);
    } catch (err) {
      setPlaylistSearchResults([]);
      setPlaylistSearchTotal(0);
      showToast(err instanceof Error ? err.message : '歌单搜索失败', 'error');
    } finally {
      setPlaylistSearchLoading(false);
    }
  }, [playlistChannelFilter, playlistSearchPageSize, showToast]);

  const handlePlaylistPageSizeChange = useCallback((next: SongResultPageSize) => {
    setPlaylistSearchPageSize(next);
    setStoredSongResultPageSize(next);
    if (searchedKeyword.trim() && activeSearchMode === 'playlist') {
      void doPlaylistSearch(searchedKeyword, 1, playlistChannelFilter, next);
    }
  }, [searchedKeyword, activeSearchMode, playlistChannelFilter, doPlaylistSearch]);

  const handlePlaylistChannelChange = useCallback((next: PlaylistChannelFilterMode) => {
    setPlaylistChannelFilter(next);
    if (searchedKeyword.trim() && activeSearchMode === 'playlist') {
      void doPlaylistSearch(searchedKeyword, 1, next);
    }
  }, [searchedKeyword, activeSearchMode, doPlaylistSearch]);

  const handlePlaylistImport = useCallback(async (platform: PlaylistPlatform, input: string) => {
    setPlaylistImportOpen(false);
    if (activeSearchMode === 'playlist' && searchedKeyword.trim() && playlistSearchResults.length > 0) {
      setPlaylistSearchBackup({
        keyword: searchedKeyword,
        results: playlistSearchResults,
        page: playlistSearchPage,
        total: playlistSearchTotal,
        channel: playlistChannelFilter,
        pageSize: playlistSearchPageSize,
      });
    }
    setSearching(true);
    setIsPlaylistResults(true);
    setSearchMode('song');
    setActiveSearchMode('song');
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
  }, [showToast, searchMode, searchedKeyword, playlistSearchResults, playlistSearchPage, playlistSearchTotal, playlistChannelFilter, playlistSearchPageSize]);

  const handleRecommendPlaylistSelect = useCallback(async (playlist: PlaylistSearchItem) => {
    await handlePlaylistImport(playlist.platform, playlist.id);
  }, [handlePlaylistImport]);

  const handleSearch = useCallback(() => {
    const keyword = query.trim();
    setActiveSearchMode(searchMode);
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

  const handleSearchModeChange = useCallback((mode: SearchMode) => {
    if (mode === searchMode) return;

    const fromQuery = query.trim();
    let keyword = fromQuery;
    if (!keyword) {
      const fromSearched = searchedKeyword.trim();
      if (fromSearched.startsWith('歌单：')) {
        keyword = playlistSearchBackup?.keyword.trim() || '';
      } else if (!fromSearched.startsWith('正在')) {
        keyword = fromSearched;
      }
    }
    if (!keyword) {
      setSearchMode(mode);
      return;
    }

    setSearchMode(mode);
    setActiveSearchMode(mode);
    setIsPlaylistResults(false);

    if (mode === 'playlist') {
      setResults([]);
      setSearchedKeyword(keyword);
      void doPlaylistSearch(keyword, 1);
      return;
    }

    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword(keyword);
    void doSearch(keyword);
  }, [searchMode, query, searchedKeyword, playlistSearchBackup, doPlaylistSearch, doSearch]);

  const handleOverlaySearch = useCallback(() => {
    const keyword = overlayQuery.trim();
    setActiveSearchMode(overlaySearchMode);
    if (overlaySearchMode === 'playlist') {
      setSearchedKeyword(keyword);
      setIsPlaylistResults(false);
      void doPlaylistSearch(keyword, 1);
      return;
    }
    setIsPlaylistResults(false);
    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword(keyword);
    void doSearch(keyword);
  }, [overlayQuery, overlaySearchMode, doPlaylistSearch, doSearch]);

  const handleOverlaySearchModeChange = useCallback((mode: SearchMode) => {
    if (mode === overlaySearchMode) return;

    const fromQuery = overlayQuery.trim();
    let keyword = fromQuery;
    if (!keyword) {
      const fromSearched = searchedKeyword.trim();
      if (fromSearched.startsWith('歌单：')) {
        keyword = playlistSearchBackup?.keyword.trim() || '';
      } else if (!fromSearched.startsWith('正在')) {
        keyword = fromSearched;
      }
    }
    if (!keyword) {
      setOverlaySearchMode(mode);
      return;
    }

    setOverlaySearchMode(mode);
    setActiveSearchMode(mode);
    setOverlayQuery(keyword);
    setIsPlaylistResults(false);

    if (mode === 'playlist') {
      setResults([]);
      setSearchedKeyword(keyword);
      void doPlaylistSearch(keyword, 1);
      return;
    }

    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setSearchedKeyword(keyword);
    void doSearch(keyword);
  }, [overlaySearchMode, overlayQuery, searchedKeyword, playlistSearchBackup, doPlaylistSearch, doSearch]);

  const clearSearchResults = useCallback(() => {
    setQuery('');
    setOverlayQuery('');
    setResults([]);
    setPlaylistSearchResults([]);
    setPlaylistSearchTotal(0);
    setPlaylistSearchLoading(false);
    setSearchedKeyword('');
    setIsPlaylistResults(false);
    setListPageSongs([]);
    setPlaylistSearchBackup(null);
    setActiveSearchMode('song');
    setOverlaySearchMode('song');
  }, []);

  const handleBackToPlaylistSearch = useCallback(() => {
    if (!playlistSearchBackup) {
      clearSearchResults();
      return;
    }
    setIsPlaylistResults(false);
    setResults([]);
    setSearchMode('playlist');
    setActiveSearchMode('playlist');
    setOverlaySearchMode('playlist');
    setSearchedKeyword(playlistSearchBackup.keyword);
    setQuery(playlistSearchBackup.keyword);
    setOverlayQuery(playlistSearchBackup.keyword);
    setPlaylistSearchResults(playlistSearchBackup.results);
    setPlaylistSearchPage(playlistSearchBackup.page);
    setPlaylistSearchTotal(playlistSearchBackup.total);
    setPlaylistChannelFilter(playlistSearchBackup.channel);
    setPlaylistSearchPageSize(playlistSearchBackup.pageSize);
    setListPageSongs([]);
  }, [playlistSearchBackup, clearSearchResults]);

  const handleAdd = async (song: SearchResult) => {
    if (!songRequestAllowed) {
      showToast('房主已禁止点歌', 'error');
      return;
    }
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
    if (!canRequestSong(useRoomStore.getState().room, isOwner, isAdmin)) {
      showToast('房主已禁止点歌', 'error');
      return;
    }
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
  }, [addingPage, addSong, showToast, isOwner, isAdmin]);

  const handleSaveFmMode = useCallback(async (mode: string) => {
    if (fmSaving) return;
    setFmSaving(true);
    const res = await setRoomFmMode(mode);
    setFmSaving(false);
    if (res.success) {
      setFmOpen(false);
      showToast('漫游模式已更新', 'success');
    } else {
      showToast(res.error || '漫游模式设置失败', 'error');
    }
  }, [fmSaving, setRoomFmMode, showToast]);

  const handleSaveAnnouncement = useCallback(async (options: { enabled: boolean; text: string }) => {
    if (announcementSaving) return;
    setAnnouncementSaving(true);
    const res = await setRoomAnnouncement(options);
    setAnnouncementSaving(false);
    if (res.success) {
      setAnnouncementOpen(false);
      showToast('公告已更新', 'success');
    } else {
      showToast(res.error || '公告设置失败', 'error');
    }
  }, [announcementSaving, setRoomAnnouncement, showToast]);

  const handleToggleSongRequest = useCallback(async () => {
    if (songRequestSaving || !room) return;
    const next = room.songRequestEnabled === false;
    setSongRequestSaving(true);
    const res = await setSongRequestEnabled(next);
    setSongRequestSaving(false);
    if (res.success) {
      showToast(next ? '已允许成员点歌' : '已禁止成员点歌', 'success');
    } else {
      showToast(res.error || '点歌设置失败', 'error');
    }
  }, [songRequestSaving, room, setSongRequestEnabled, showToast]);

  const handleCloseAnnouncementPopup = useCallback(() => {
    if (room?.id && room.announcementEnabled && room.announcementText?.trim()) {
      markAnnouncementSeen(room.id, room.announcementEnabled, room.announcementText);
    }
    setAnnouncementPopupOpen(false);
  }, [room]);

  const handleAddCurrentPage = useCallback(() => {
    void handleAddMany(listPageSongs);
  }, [handleAddMany, listPageSongs]);

  const handleCopyRoom = async () => {
    if (!room?.id) return;
    const text = buildRoomShareText({
      inviterNickname: nickname,
      roomId: room.id,
      roomName: room.name,
      currentSong: room.current
        ? { name: room.current.name, artist: room.current.artist }
        : null,
      isPlaying: room.isPlaying,
    });
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('复制失败，请手动复制地址栏链接', 'error');
    }
  };

  const toggleCoverBg = () => {
    setCoverBgEnabled((prev) => {
      const next = !prev;
      writeRoomCoverBgEnabled(next);
      return next;
    });
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
  const showDesktopSearchOverlay = Boolean(searchedKeyword || searching || playlistSearchLoading);
  const showPlaylistSearch = activeSearchMode === 'playlist' && Boolean(searchedKeyword || playlistSearchLoading);
  const hasPlaylistSearchResults = showPlaylistSearch && playlistSearchResults.length > 0;
  const showPlaylistEmpty = showPlaylistSearch && !playlistSearchLoading && playlistSearchResults.length === 0;
  const showPlaylistSkeleton = showPlaylistSearch && playlistSearchLoading && playlistSearchResults.length === 0;
  const playlistSearchTotalPages = Math.max(1, Math.ceil(playlistSearchTotal / playlistSearchPageSize));
  const searchButtonLoading = searchMode === 'song'
    ? searching
    : playlistSearchLoading && playlistSearchResults.length === 0;

  const overlaySearchButtonLoading = overlaySearchMode === 'song'
    ? searching
    : playlistSearchLoading && playlistSearchResults.length === 0;

  const renderResultsSummary = () => {
    if (activeSearchMode === 'playlist' && playlistSearchLoading) {
      return `正在搜索歌单「${searchedKeyword}」...`;
    }
    if (searching) {
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
      <Tooltip side="bottom" content="搜索类型">
        <div className="flex flex-shrink-0 overflow-hidden rounded-xl border border-netease-border bg-netease-card p-1 sm:rounded-2xl">
        {([
          ['song', '歌曲'],
          ['playlist', '歌单'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleSearchModeChange(mode)}
            className={`rounded-lg px-2.5 py-2 text-xs transition-colors sm:px-3 sm:py-2.5 sm:text-sm ${
              searchMode === mode ? 'bg-netease-red text-white shadow-sm' : 'text-netease-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        </div>
      </Tooltip>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-netease-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={searchMode === 'playlist' ? '搜索网易/QQ歌单...' : '搜索歌曲、歌手...'}
          className="w-full bg-netease-card border border-netease-border rounded-xl sm:rounded-2xl pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 text-sm sm:text-base text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={handleSearch}
        disabled={!query.trim() || (searchMode === 'song' && searching)}
        className="flex-shrink-0 px-3.5 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-netease-red text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        {searchButtonLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 sm:hidden" />}
        <span className="hidden sm:inline">搜索</span>
      </button>
    </div>
  );

  const playlistSearchList = (
    <div
      className="flex min-h-0 flex-col"
      style={{ height: RESULT_BODY_HEIGHT }}
    >
      <div className={`relative min-h-0 flex-1 overflow-y-auto ${playlistSearchLoading ? 'pointer-events-none' : ''}`}>
        <div className={`space-y-2 transition-opacity ${playlistSearchLoading ? 'opacity-40' : ''}`}>
          {playlistSearchResults.map((playlist) => (
            <Tooltip key={`${playlist.platform}-${playlist.id}`} content="双击查看歌单" side="bottom">
              <div
                className="group flex cursor-pointer items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 sm:gap-3 sm:p-3"
                onDoubleClick={() => {
                  if (!playlistSearchLoading && !searching) {
                    void handlePlaylistImport(playlist.platform, playlist.id);
                  }
                }}
              >
                <img
                  src={playlist.coverImgUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect fill="%23333" width="48" height="48"/><text x="24" y="28" text-anchor="middle" fill="%23666" font-size="16">♪</text></svg>'}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-medium">{playlist.name}</p>
                  <p className="truncate text-xs text-netease-muted">
                    {playlist.creatorName || (playlist.platform === 'qq' ? 'QQ音乐歌单' : '网易云歌单')} · {playlist.trackCount} 首
                  </p>
                </div>
                <SourceBadge source={playlist.platform === 'qq' ? 'tencent' : 'netease'} variant="muted" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePlaylistImport(playlist.platform, playlist.id);
                  }}
                  disabled={playlistSearchLoading || searching}
                  className="flex flex-shrink-0 items-center gap-1 rounded-full bg-netease-red/10 px-2.5 py-1 text-xs font-medium text-netease-red transition-all hover:bg-netease-red hover:text-white disabled:opacity-50"
                >
                  <ListMusic className="h-4 w-4" />
                  查看
                </button>
              </div>
            </Tooltip>
          ))}
        </div>
        {playlistSearchLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-netease-muted" />
          </div>
        )}
      </div>
      <div className="mt-auto flex-shrink-0 space-y-2 overflow-visible border-t border-netease-border/40 bg-netease-bg/90 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageSizeSelect
            value={playlistSearchPageSize}
            options={SONG_RESULT_PAGE_SIZE_OPTIONS}
            onChange={handlePlaylistPageSizeChange}
          />
          <span className="text-xs text-netease-muted">
            {playlistSearchPage} / {playlistSearchTotalPages}
            <span className="ml-1 text-netease-muted/50">共 {playlistSearchTotal} 个</span>
          </span>
        </div>
        <PageNumberPagination
          page={playlistSearchPage}
          totalPages={playlistSearchTotalPages}
          disabled={playlistSearchLoading}
          onPageChange={(p) => void doPlaylistSearch(searchedKeyword, p)}
        />
      </div>
    </div>
  );

  const overlaySearchBar = (
    <div className="flex gap-2 flex-shrink-0">
      <div className="flex flex-shrink-0 overflow-hidden rounded-xl border border-netease-border bg-netease-card p-1">
        {([
          ['song', '歌曲'],
          ['playlist', '歌单'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleOverlaySearchModeChange(mode)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              overlaySearchMode === mode ? 'bg-netease-red text-white shadow-sm' : 'text-netease-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-netease-muted pointer-events-none" />
        <input
          type="text"
          value={overlayQuery}
          onChange={(e) => setOverlayQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleOverlaySearch()}
          placeholder={overlaySearchMode === 'playlist' ? '搜索网易/QQ歌单...' : '搜索歌曲、歌手...'}
          className="w-full bg-netease-card border border-netease-border rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50 transition-colors"
        />
      </div>
      <button
        type="button"
        onClick={handleOverlaySearch}
        disabled={!overlayQuery.trim() || (overlaySearchMode === 'song' && searching)}
        className="flex-shrink-0 px-3 py-2 rounded-xl bg-netease-red text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
        {overlaySearchButtonLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        搜索
      </button>
    </div>
  );



  return (

    <div className="relative isolate flex h-full flex-col overflow-hidden">

      {coverBgEnabled && <RoomAmbientBackground song={room.current} />}

      <AudioEngine />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}

      <RoomFmModeModal
        open={fmOpen}
        value={normalizeFmMode(room?.neteaseFmMode)}
        saving={fmSaving}
        onClose={() => setFmOpen(false)}
        onSave={handleSaveFmMode}
      />

      <RoomAnnouncementModal
        open={announcementOpen}
        enabled={Boolean(room?.announcementEnabled)}
        text={room?.announcementText || ''}
        saving={announcementSaving}
        onClose={() => setAnnouncementOpen(false)}
        onSave={handleSaveAnnouncement}
      />

      <RoomAnnouncementPopup
        open={announcementPopupOpen}
        text={room?.announcementText || ''}
        onClose={handleCloseAnnouncementPopup}
      />

      <header className={`relative z-30 flex-shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3 safe-top ${
        coverBgEnabled
          ? 'border-white/10 bg-black/20 backdrop-blur-xl [-webkit-backdrop-filter:blur(24px)]'
          : 'glass border-netease-border/50'
      }`}>

        <div className="max-w-[1680px] mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center justify-between gap-2 min-w-0">

            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <h1 className="text-base sm:text-lg font-semibold truncate">

                  <span className="truncate">{room.name}</span>

                </h1>

                {isCreator && (
                  <>
                    <Tooltip side="bottom" content="修改房间名">
                      <button
                        type="button"
                        onClick={openRenameModal}
                        className="flex-shrink-0 rounded-lg p-1 text-netease-muted hover:bg-white/10 hover:text-white transition-colors"
                        aria-label="修改房间名"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip side="bottom" content={room.isLocked ? '房间已上锁' : '房间上锁'}>
                      <button
                        type="button"
                        onClick={openLockModal}
                        className={`flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10 ${room.isLocked ? 'text-amber-400' : 'text-netease-muted hover:text-white'}`}
                        aria-label={room.isLocked ? '房间已上锁' : '房间上锁'}
                      >
                        {room.isLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                      </button>
                    </Tooltip>
                  </>
                )}

                {!isCreator && (room.isLocked || room.hasPassword) && (
                  <Tooltip side="bottom" content={room.hasPassword ? '密码房' : '已上锁'}>
                    <span className="flex-shrink-0 text-amber-400/90">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                  </Tooltip>
                )}

                {isOwner && (

                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">

                    <Crown className="w-3 h-3" />

                    房主

                  </span>

                )}

                {isAdmin && !isOwner && (
                  <span className="flex items-center gap-0.5 text-[10px] text-sky-300/90 bg-sky-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    管理员
                  </span>
                )}

                {isOwner && (
                  <Tooltip side="bottom" content="私人漫游模式">
                    <button
                      type="button"
                      onClick={() => setFmOpen(true)}
                      className="flex-shrink-0 rounded-lg p-1 text-netease-muted transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="私人漫游模式"
                    >
                      <Radio className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                )}

                {canControlPlayback && (
                  <>
                    <Tooltip side="bottom" content="房间公告">
                      <button
                        type="button"
                        onClick={() => setAnnouncementOpen(true)}
                        className={`flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10 ${
                          room.announcementEnabled ? 'text-amber-400' : 'text-netease-muted hover:text-white'
                        }`}
                        aria-label="房间公告"
                      >
                        <Megaphone className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip side="bottom" content={room.songRequestEnabled === false ? '已禁止点歌（点击允许）' : '允许点歌（点击禁止）'}>
                      <button
                        type="button"
                        onClick={() => void handleToggleSongRequest()}
                        disabled={songRequestSaving}
                        className={`flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10 disabled:opacity-50 ${
                          room.songRequestEnabled === false ? 'text-amber-400' : 'text-netease-muted hover:text-white'
                        }`}
                        aria-label={room.songRequestEnabled === false ? '已禁止点歌' : '允许点歌'}
                      >
                        {room.songRequestEnabled === false ? (
                          <Ban className="w-3.5 h-3.5" />
                        ) : (
                          <Music2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Tooltip>
                  </>
                )}

              </div>

              <p className="text-xs text-netease-muted mt-0.5">
                房间号 <span className="text-netease-red">{room.id}</span>
              </p>

              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-netease-muted">{room.userCount} 人在线</p>
                <RoomFmModeBadge fmMode={room.neteaseFmMode} />
                {room.songRequestEnabled === false && (
                  <span className="text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full">禁止点歌</span>
                )}
                {room.announcementEnabled && room.announcementText?.trim() && (
                  <button
                    type="button"
                    onClick={() => setAnnouncementPopupOpen(true)}
                    className="text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full hover:bg-amber-400/15"
                  >
                    查看公告
                  </button>
                )}
              </div>

            </div>

            <div className="sm:hidden flex-shrink-0">

              <OnlineUsers
                users={room.users}
                creatorId={room.creatorId}
                onNotice={showToast}
              />

            </div>

          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">

            <div className="flex items-center gap-1 sm:gap-2">

              <Tooltip side="bottom" content={coverBgEnabled ? '关闭封面背景' : '开启封面背景'}>
                <button
                  type="button"
                  onClick={toggleCoverBg}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:px-3 ${
                    coverBgEnabled
                      ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                      : 'text-netease-muted hover:bg-netease-card hover:text-white'
                  }`}
                  aria-label="封面背景"
                  aria-pressed={coverBgEnabled}
                >
                  <Image className="h-4 w-4" />
                  <span className="hidden sm:inline">封面背景</span>
                </button>
              </Tooltip>

              <Tooltip side="bottom" content="TV歌词">
                <button
                  onClick={handleCopyTvLink}
                  className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"
                >
                  {tvCopied ? <Check className="w-4 h-4 text-green-400" /> : <Tv className="w-4 h-4" />}
                  <span className="hidden sm:inline">{tvCopied ? '已复制' : 'TV歌词'}</span>
                </button>
              </Tooltip>

              <Tooltip side="bottom" content="分享房间">
                <button
                  onClick={handleCopyRoom}
                  className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copied ? '已复制' : '分享房间'}</span>
                </button>
              </Tooltip>

              <Tooltip side="bottom" content="退出房间">
                <button
                  onClick={() => {
                    leaveRoom();
                    navigate('/');
                  }}
                  className="flex items-center gap-1.5 text-xs text-netease-muted hover:text-white transition-colors px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-netease-card"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">退出房间</span>
                </button>
              </Tooltip>

            </div>

            <div className="hidden sm:block">

              <OnlineUsers
                users={room.users}
                creatorId={room.creatorId}
                onNotice={showToast}
              />

            </div>

          </div>

        </div>

      </header>



      <div className="relative z-10 flex-1 min-h-0 max-w-[1680px] mx-auto w-full px-3 sm:px-4 pt-3 sm:pt-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] overflow-y-auto lg:overflow-hidden">

        <div className="flex flex-col lg:grid lg:grid-cols-[360px_minmax(0,1fr)_360px] lg:h-full lg:min-h-0 gap-3 lg:gap-4">

          {/* 左侧：点歌热榜 + 为你推荐 */}
          {isLgUp && (
            <div className="order-0 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-netease-border/50 bg-netease-card/30 lg:h-full">
              <div className="flex min-h-[9rem] flex-[5] flex-col overflow-hidden border-b border-netease-border/50">
                <HotSongPanel embedded addingId={addingId} onAdd={handleAdd} refreshKey={hotRefreshKey} />
              </div>
              <div className="flex min-h-0 flex-[3.8] flex-col overflow-hidden">
                <RecommendedPlaylistsPanel onSelectPlaylist={handleRecommendPlaylistSelect} />
              </div>
            </div>
          )}

          {/* 中间：搜索 + 播放队列 */}
          <div className="order-1 flex min-h-0 min-w-0 flex-col lg:h-full lg:overflow-hidden">
            {!isLgUp && (
              <div className="mb-3 space-y-3">
                <HotSongPanel compact addingId={addingId} onAdd={handleAdd} refreshKey={hotRefreshKey} />
                <RecommendedPlaylistsPanel compact onSelectPlaylist={handleRecommendPlaylistSelect} />
              </div>
            )}

            <div className="flex-shrink-0">
              <JumpRequestBanner />
              {searchBar}
              <div className="mb-2 flex items-center justify-between gap-2 overflow-x-auto px-1 sm:mb-4">
                <button
                  type="button"
                  onClick={() => setSongHistoryOpen(true)}
                  className="rounded-lg px-2 py-1 text-[11px] sm:text-xs text-white/75 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                >
                  播放历史
                </button>
                {searchableCount > 0 && (
                  <div className="flex flex-shrink-0 items-center gap-1">
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
                )}
              </div>
            </div>

            {/* 桌面：播放队列撑满剩余高度，底部与热榜对齐 */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col mt-1">
              {renderQueueSection(true)}
            </div>

            {/* 手机：搜索结果内联展示（保持原样） */}
            <div className="lg:hidden">
              {searching && searchedKeyword && !showPlaylistSearch && <SearchSkeleton />}
              {showPlaylistSkeleton && (
                <SearchSkeleton count={playlistSearchPageSize} showPaginationFooter={false} />
              )}

              {!searching && !playlistSearchLoading && searchedKeyword && (
                <div className="flex items-center justify-between mb-2 px-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isPlaylistResults && playlistSearchBackup && (
                      <button
                        type="button"
                        onClick={handleBackToPlaylistSearch}
                        className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-netease-muted hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        返回
                      </button>
                    )}
                    <span className="text-xs text-netease-muted min-w-0 truncate">
                      {renderResultsSummary()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {showPlaylistSearch && (
                      <PlaylistChannelFilter value={playlistChannelFilter} onChange={handlePlaylistChannelChange} />
                    )}
                    {searchableCount > 0 && !isPlaylistResults && (
                      activeSearchMode === 'song' && <SearchFilterSelect value={searchFilterMode} onChange={handleSearchFilterChange} />
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

              {!searching && !playlistSearchLoading && searchedKeyword && !hasPlaylistSearchResults && results.length === 0 && (
                <p className="text-center text-netease-muted py-4 sm:py-6 animate-fade-in">
                  {showPlaylistEmpty ? '没有找到相关歌单' : (isPlaylistResults ? '歌单为空或链接无效' : '换个关键词试试')}
                </p>
              )}

              {hasPlaylistSearchResults && playlistSearchList}

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

          {/* 右侧：聊天室占满 */}
          <div className="order-2 flex min-h-0 min-w-0 flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="lg:hidden">
              {renderQueueSection()}
            </div>

            <div className="h-[300px] sm:h-[320px] lg:h-full lg:min-h-0 lg:flex-1">
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
              <div className="min-w-0 flex items-center gap-2">
                {isPlaylistResults && playlistSearchBackup && (
                  <button
                    type="button"
                    onClick={handleBackToPlaylistSearch}
                    className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-netease-muted hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    返回歌单
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-white">{isPlaylistResults ? '歌单详情' : '搜索结果'}</h2>
                  <p className="text-xs text-netease-muted mt-0.5 truncate">
                    {renderResultsSummary()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {showPlaylistSearch && (
                  <PlaylistChannelFilter value={playlistChannelFilter} onChange={handlePlaylistChannelChange} />
                )}
                {!searching && searchableCount > 0 && !isPlaylistResults && (
                  activeSearchMode === 'song' && <SearchFilterSelect value={searchFilterMode} onChange={handleSearchFilterChange} />
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
            <div className="flex-shrink-0 px-3 pt-3">
              {overlaySearchBar}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 pt-2">
              {searching && searchedKeyword && !showPlaylistSearch && <SearchSkeleton fillHeight />}
              {showPlaylistSkeleton && (
                <SearchSkeleton fillHeight count={playlistSearchPageSize} showPaginationFooter={false} />
              )}
              {!searching && !playlistSearchLoading && searchedKeyword && !hasPlaylistSearchResults && results.length === 0 && (
                <p className="text-center text-netease-muted py-10 animate-fade-in">
                  {showPlaylistEmpty ? '没有找到相关歌单' : (isPlaylistResults ? '歌单为空或链接无效' : '换个关键词试试')}
                </p>
              )}
              {hasPlaylistSearchResults && playlistSearchList}
              {!searching && searchedKeyword && (
                !showPlaylistSearch && (
                <SongResultList
                  results={results}
                  addingId={addingId}
                  onAdd={handleAdd}
                  keyword={searchedKeyword}
                  alwaysShowActions
                  fillHeight
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
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setSongHistoryOpen(false)} aria-label="关闭播放历史" />
          <div className="relative z-10 flex max-h-[min(72vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 glass shadow-2xl">
            <div className="flex items-center justify-between border-b border-netease-border/50 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-white">播放历史</h2>
                <p className="mt-0.5 text-xs text-netease-muted">最近 {songHistoryItems.length} 首，可复播或收藏</p>
              </div>
              <button type="button" onClick={() => setSongHistoryOpen(false)} className="rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {songHistoryLoading ? (
                <div className="py-16 text-center text-sm text-netease-muted">
                  <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin opacity-40" />
                  加载播放历史…
                </div>
              ) : !songHistoryItems.length ? (
                <div className="py-16 text-center text-sm text-netease-muted">
                  <History className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  暂无播放历史
                </div>
              ) : (
                <div className="space-y-2">
                  {songHistoryItems.map((song: SongHistoryItem, index: number) => {
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
                          <p className="truncate text-[11px] text-netease-muted/80">{song.requestedBy || '匿名'} 播放{formatHistoryTime(song.requestedAt) ? ` · ${formatHistoryTime(song.requestedAt)}` : ''}</p>
                        </div>
                        <FavoriteButton song={song} className="h-8 w-8 text-netease-muted hover:text-rose-300" />
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
                <p className="mt-0.5 text-xs text-netease-muted">
                  共 {favorites.length} 首{favoriteQuery.trim() ? `，筛选 ${filteredFavorites.length} 首` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Tooltip content="一键点歌">
                  <button
                    type="button"
                    onClick={() => void handleAddAllFavorites()}
                    disabled={filteredFavorites.length === 0 || addingAllFavorites || importingFavorites}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-netease-red hover:bg-netease-red/10 hover:text-netease-red disabled:opacity-50"
                  >
                    {addingAllFavorites ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                    一键点歌
                  </button>
                </Tooltip>
                <Tooltip content="导入歌单">
                  <button
                    type="button"
                    onClick={handleImportFavoritesJson}
                    disabled={importingFavorites}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-netease-muted hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    {importingFavorites ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {favoritesImportProgress || '导入歌单'}
                  </button>
                </Tooltip>
                <Tooltip content="导出歌单">
                  <button
                    type="button"
                    onClick={handleExportFavoritesJson}
                    disabled={favorites.length === 0 || importingFavorites}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-netease-muted hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    导出歌单
                  </button>
                </Tooltip>
                <button type="button" onClick={() => setFavoritesOpen(false)} className="rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="flex-shrink-0 border-b border-netease-border/50 px-4 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-netease-muted" />
                <input
                  type="text"
                  value={favoriteQuery}
                  onChange={(event) => setFavoriteQuery(event.target.value)}
                  placeholder="搜索收藏歌名、歌手..."
                  className="w-full rounded-xl border border-netease-border bg-netease-dark py-2 pl-9 pr-3 text-sm text-white placeholder:text-netease-muted/50 focus:border-netease-red/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {favoritesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-netease-red" /></div>
              ) : filteredFavorites.length === 0 ? (
                <div className="py-16 text-center text-sm text-netease-muted">
                  <Heart className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {favorites.length === 0 ? '暂无收藏歌曲' : '没有匹配的收藏歌曲'}
                </div>
              ) : (
                <div className="space-y-2">
                  {pagedFavorites.map((song) => {
                    const key = songKey(song);
                    return (
                      <div key={key} className="group flex items-center gap-2 rounded-xl p-2.5 transition-colors hover:bg-netease-card/80 sm:gap-3 sm:p-3">
                        <Tooltip content="取消收藏">
                          <button
                            type="button"
                            onClick={() => void removeFavorite(song)}
                            disabled={removingFavoriteId === key}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                            aria-label="取消收藏"
                          >
                          {removingFavoriteId === key ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <span className="text-base leading-none">❤</span>
                          )}
                          </button>
                        </Tooltip>
                        <SongCover song={song} className="h-12 w-12 flex-shrink-0 rounded-lg bg-netease-card object-cover" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-sm font-medium">{song.name}</p>
                          <p className="truncate text-xs text-netease-muted">{song.artist}{song.album ? ` · ${song.album}` : ''}</p>
                        </div>
                        <SourceBadge source={song.source} variant="muted" />
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
            {!favoritesLoading && filteredFavorites.length > 0 && (
              <div className="flex-shrink-0 space-y-2 border-t border-netease-border/40 bg-netease-bg/90 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PageSizeSelect
                    value={favoritePageSize}
                    options={FAVORITES_PAGE_SIZE_OPTIONS}
                    onChange={setFavoritePageSize}
                  />
                  <span className="text-xs text-netease-muted">
                    第 {favoritePage} / {favoriteTotalPages} 页
                    <span className="ml-1 text-netease-muted/50">共 {filteredFavorites.length} 首</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={favoritePage <= 1}
                    onClick={() => setFavoritePage((page) => Math.max(1, page - 1))}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={favoritePage >= favoriteTotalPages}
                    onClick={() => setFavoritePage((page) => Math.min(favoriteTotalPages, page + 1))}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-netease-muted transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    下一页
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {(room.current || room.randomLoading) && (
        <MiniPlayer onExpand={() => setShowPlayer(true)} transparentBar={coverBgEnabled} />
      )}



      {showPlayer && room.current && (

        <PlayerPage onClose={() => setShowPlayer(false)} />

      )}

      {renameOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRenameOpen(false)} aria-label="关闭" />
          <div className="relative w-full max-w-sm glass rounded-2xl border border-white/10 shadow-2xl p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">修改房间名</h2>
              <button type="button" onClick={() => setRenameOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              maxLength={30}
              placeholder="房间名称"
              className="w-full bg-netease-dark border border-netease-border rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50 mb-5"
              onKeyDown={(e) => e.key === 'Enter' && void handleRenameRoom()}
            />
            <button
              type="button"
              onClick={() => void handleRenameRoom()}
              disabled={renameSaving || !renameDraft.trim()}
              className="w-full flex items-center justify-center gap-2 bg-netease-red hover:bg-red-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {renameSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              保存
            </button>
          </div>
        </div>,
        document.body,
      )}

      {lockOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setLockOpen(false)} aria-label="关闭" />
          <div className="relative w-full max-w-sm glass rounded-2xl border border-white/10 shadow-2xl p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">房间上锁</h2>
              <button type="button" onClick={() => setLockOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            {room.isLocked ? (
              <div className="space-y-4">
                <p className="text-sm text-white/70">
                  房间当前已上锁{room.hasPassword ? '（需密码进入）' : '（禁止他人进入）'}。
                </p>
                <button
                  type="button"
                  onClick={() => void handleUnlockRoom()}
                  disabled={lockSaving}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-medium py-3 rounded-xl transition-colors"
                >
                  {lockSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <LockOpen className="w-5 h-5" />}
                  解锁房间
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-white/70">上锁后其他人无法进入。可选择设置密码，留空则完全禁止进入。</p>
                <label className="block text-xs text-white/50 mb-1.5">进入密码（可选）</label>
                <input
                  type="password"
                  value={lockPassword}
                  onChange={(e) => setLockPassword(e.target.value)}
                  maxLength={32}
                  placeholder="留空则禁止任何人进入"
                  className="w-full bg-netease-dark border border-netease-border rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50"
                />
                <button
                  type="button"
                  onClick={() => void handleLockRoom()}
                  disabled={lockSaving}
                  className="w-full flex items-center justify-center gap-2 bg-netease-red hover:bg-red-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  {lockSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                  确认上锁
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

    </div>

  );

}
