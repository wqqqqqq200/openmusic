import { Fragment, useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  fetchNeteasePlaylistMetas,
  searchNeteasePlaylists,
  searchTencentPlaylists,
  type PlaylistPlatform,
  type PlaylistSearchItem,
} from '../api/music/playlist';

const CURATED_NETEASE: PlaylistSearchItem[] = [
  {
    id: '3778678',
    platform: 'netease',
    name: '云音乐热歌榜',
    coverImgUrl: 'https://p1.music.126.net/0SUEG8yDACfx0Bw2MYFv4Q==/109951170048519512.jpg',
    trackCount: 0,
    playCount: 0,
  },
  {
    id: '19723756',
    platform: 'netease',
    name: '云音乐飙升榜',
    coverImgUrl: 'https://p2.music.126.net/rIi7Qzy2i2Y_1QD7cd0MYA==/109951170048506929.jpg',
    trackCount: 0,
    playCount: 0,
  },
  {
    id: '2250011882',
    platform: 'netease',
    name: '抖音排行榜',
    coverImgUrl: 'https://p2.music.126.net/8sRm2fQNh_KZeWmJ1sRhQQ==/109951165611408950.jpg',
    trackCount: 0,
    playCount: 0,
  },
  {
    id: '3779629',
    platform: 'netease',
    name: '云音乐新歌榜',
    coverImgUrl: 'https://p1.music.126.net/5guhqPBTcIrrhLBotgaT6w==/109951170048511751.jpg',
    trackCount: 0,
    playCount: 0,
  },
];

const CURATED_NETEASE_IDS = new Set(CURATED_NETEASE.map((item) => item.id));
const NETEASE_RECOMMEND_KEYWORD = '推荐';
const QQ_RECOMMEND_KEYWORD = '热歌';
const NETEASE_EXTRA_LIMIT = 4;
const QQ_EXTRA_LIMIT = 4;

const PLATFORM_LABELS: Record<PlaylistPlatform, string> = {
  netease: '网易',
  qq: 'QQ',
};

const CURATED_COUNT = CURATED_NETEASE.length;

function playlistKey(playlist: PlaylistSearchItem) {
  return `${playlist.platform}-${playlist.id}`;
}

function mergePlaylistMeta(
  base: PlaylistSearchItem[],
  meta: PlaylistSearchItem[],
): PlaylistSearchItem[] {
  const metaMap = new Map(meta.map((item) => [item.id, item]));
  return base.map((item) => {
    const remote = metaMap.get(item.id);
    if (!remote) return item;
    return {
      ...item,
      name: remote.name || item.name,
      coverImgUrl: remote.coverImgUrl || item.coverImgUrl,
      creatorName: remote.creatorName || item.creatorName,
      trackCount: remote.trackCount || item.trackCount,
      playCount: remote.playCount || item.playCount,
    };
  });
}

interface Props {
  onSelectPlaylist: (playlist: PlaylistSearchItem) => Promise<void>;
  compact?: boolean;
}

function PlatformGlassTag({
  platform,
  compact = false,
}: {
  platform: PlaylistPlatform;
  compact?: boolean;
}) {
  return (
    <span
      className={`absolute right-1 top-1 z-10 rounded-md border border-white/25 bg-black/30 font-medium text-white/95 shadow-sm backdrop-blur-md ${
        compact ? 'px-1 py-px text-[8px] leading-tight' : 'px-1.5 py-0.5 text-[9px]'
      }`}
    >
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

function PlaylistCover({
  playlist,
  isLoading,
  compact = false,
}: {
  playlist: PlaylistSearchItem;
  isLoading: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-netease-card ${
        compact ? 'aspect-square w-full flex-shrink-0 rounded-md' : 'aspect-square w-full rounded-lg'
      }`}
    >
      <PlatformGlassTag platform={playlist.platform} compact={compact} />
      {playlist.coverImgUrl ? (
        <img
          src={playlist.coverImgUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
          }}
        />
      ) : null}
      <div
        className={`h-full w-full items-center justify-center bg-gradient-to-br from-netease-card to-netease-dark text-netease-muted/35 ${playlist.coverImgUrl ? 'hidden' : 'flex'} ${compact ? 'text-sm' : 'text-lg'}`}
      >
        ♪
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className={`animate-spin text-white ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
        </div>
      )}
    </div>
  );
}

function PlaylistSkeleton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const cardClass = compact ? 'aspect-square w-full rounded-md' : 'aspect-square w-full rounded-lg';

  if (compact) {
    return (
      <div className="flex min-w-min gap-2.5 pb-1">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex w-20 flex-shrink-0 flex-col items-center">
            <div className={`${cardClass} skeleton-shimmer`} />
            <div className="mt-1 h-2 w-full rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: CURATED_COUNT }, (_, i) => (
          <div key={`curated-${i}`} className="flex flex-col items-center">
            <div className={`${cardClass} skeleton-shimmer`} />
            <div className="mt-1 w-full space-y-1">
              <div className="h-2 w-full rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: NETEASE_EXTRA_LIMIT }, (_, i) => (
          <Fragment key={`extra-skeleton-${i}`}>
            {Array.from({ length: 2 }, (_, col) => (
              <div key={col} className="flex h-full flex-col items-center">
                <div className={`${cardClass} skeleton-shimmer`} />
                <div className="mt-1 w-full space-y-1">
                  <div className="h-2 w-full rounded skeleton-shimmer" />
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function PlaylistCard({
  playlist,
  isLoading,
  disabled,
  compact,
  onSelect,
}: {
  playlist: PlaylistSearchItem;
  isLoading: boolean;
  disabled: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`group flex flex-col transition-colors disabled:opacity-60 ${
        compact
          ? 'w-20 flex-shrink-0 items-center text-center'
          : 'h-full w-full items-center rounded-lg p-0.5 text-center hover:bg-netease-card/60'
      }`}
    >
      <PlaylistCover playlist={playlist} isLoading={isLoading} compact={compact} />
      <p
        className={`line-clamp-2 w-full min-h-[2.5em] font-medium leading-tight text-white/90 ${
          compact ? 'mt-1 text-center text-[10px] text-white/85' : 'mt-1 px-0.5 text-center text-[10px]'
        }`}
      >
        {playlist.name}
      </p>
    </button>
  );
}

export default function RecommendedPlaylistsPanel({ onSelectPlaylist, compact = false }: Props) {
  const [neteasePlaylists, setNeteasePlaylists] = useState<PlaylistSearchItem[]>(CURATED_NETEASE);
  const [qqPlaylists, setQqPlaylists] = useState<PlaylistSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [curatedMeta, neteaseSearch, qqSearch] = await Promise.all([
          fetchNeteasePlaylistMetas(CURATED_NETEASE.map((item) => item.id)),
          searchNeteasePlaylists(NETEASE_RECOMMEND_KEYWORD, 1, NETEASE_EXTRA_LIMIT + 4),
          searchTencentPlaylists(QQ_RECOMMEND_KEYWORD, 1, QQ_EXTRA_LIMIT + 4),
        ]);
        if (cancelled) return;

        const curated = mergePlaylistMeta(CURATED_NETEASE, curatedMeta);
        const neteaseExtras = neteaseSearch.playlists
          .filter((item) => !CURATED_NETEASE_IDS.has(item.id))
          .slice(0, NETEASE_EXTRA_LIMIT)
          .map((item) => ({ ...item, platform: 'netease' as const }));

        const qqItems = qqSearch.playlists
          .slice(0, QQ_EXTRA_LIMIT)
          .map((item) => ({ ...item, platform: 'qq' as const }));

        setNeteasePlaylists([...curated, ...neteaseExtras]);
        setQqPlaylists(qqItems);
      } catch {
        if (!cancelled) {
          setNeteasePlaylists(CURATED_NETEASE);
          setQqPlaylists([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = async (playlist: PlaylistSearchItem) => {
    const key = playlistKey(playlist);
    if (loadingKey) return;
    setLoadingKey(key);
    try {
      await onSelectPlaylist(playlist);
    } finally {
      setLoadingKey(null);
    }
  };

  const renderPlaylistHorizontalScroll = () => {
    const curated = neteasePlaylists.slice(0, CURATED_COUNT);
    const neteaseExtras = neteasePlaylists.slice(CURATED_COUNT);
    const items: PlaylistSearchItem[] = [...curated];
    for (let i = 0; i < NETEASE_EXTRA_LIMIT; i += 1) {
      if (neteaseExtras[i]) items.push(neteaseExtras[i]);
      if (qqPlaylists[i]) items.push(qqPlaylists[i]);
    }

    return (
      <div className="flex min-w-min gap-2.5 pb-1">
        {items.map((playlist) => (
          <PlaylistCard
            key={playlistKey(playlist)}
            playlist={playlist}
            isLoading={loadingKey === playlistKey(playlist)}
            disabled={Boolean(loadingKey)}
            compact
            onSelect={() => void handleSelect(playlist)}
          />
        ))}
      </div>
    );
  };

  const renderPlaylistGrid = () => {
    const curated = neteasePlaylists.slice(0, CURATED_COUNT);
    const neteaseExtras = neteasePlaylists.slice(CURATED_COUNT);

    const renderCard = (playlist: PlaylistSearchItem) => (
      <PlaylistCard
        key={playlistKey(playlist)}
        playlist={playlist}
        isLoading={loadingKey === playlistKey(playlist)}
        disabled={Boolean(loadingKey)}
        compact={false}
        onSelect={() => void handleSelect(playlist)}
      />
    );

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {curated.map(renderCard)}
        </div>
        <div className="grid grid-cols-2 items-stretch gap-2">
          {Array.from({ length: NETEASE_EXTRA_LIMIT }, (_, i) => (
            <Fragment key={`extra-row-${i}`}>
              {neteaseExtras[i] ? (
                <div className="min-h-0">{renderCard(neteaseExtras[i])}</div>
              ) : (
                <div aria-hidden />
              )}
              {qqPlaylists[i] ? (
                <div className="min-h-0">{renderCard(qqPlaylists[i])}</div>
              ) : !loading && i === 0 && qqPlaylists.length === 0 ? (
                <p className="flex min-h-full items-center justify-center px-1 py-2 text-center text-[10px] text-netease-muted">
                  暂无 QQ 推荐
                </p>
              ) : (
                <div aria-hidden />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  if (compact) {
    return (
      <div className="flex flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-netease-border/50 bg-netease-card/30">
        <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-netease-border/50 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-sky-400" />
          <h2 className="text-xs font-medium">为你推荐</h2>
        </div>
        <div className="overflow-x-auto p-2">
          {loading ? <PlaylistSkeleton compact /> : renderPlaylistHorizontalScroll()}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-netease-border/50 px-4 py-1.5 lg:border-t-0">
        <Sparkles className="h-4 w-4 text-sky-400" />
        <h2 className="text-sm font-medium">为你推荐</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {loading ? <PlaylistSkeleton /> : renderPlaylistGrid()}
      </div>
    </div>
  );
}
