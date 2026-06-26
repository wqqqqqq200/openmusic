import { useState } from 'react';
import { Play, Pause, SkipForward, ChevronUp, Loader2 } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';
import { useSocket } from '../hooks/useSocket';

import { formatDuration, getCoverUrl, getActiveLyricPair } from '../api/music';
import { useTrackDuration, clampPlaybackTime } from '../hooks/useTrackDuration';
import { useSmoothPlaybackTime } from '../hooks/useSmoothPlaybackTime';
import { useTrackLyrics } from '../hooks/useTrackLyrics';

import SourceBadge from './SourceBadge';

import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import FavoriteButton from './FavoriteButton';
import Tooltip from './Tooltip';

interface Props {

  onExpand: () => void;
  transparentBar?: boolean;

}



export default function MiniPlayer({ onExpand, transparentBar = true }: Props) {

  const room = useRoomStore((s) => s.room);

  const canControlPlayback = useRoomStore((s) => s.canControlPlayback);
  const trackLoading = useAudioStore((s) => s.trackLoading);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const seekPlayback = useAudioStore((s) => s.seekPlayback);
  const localPlayback = useAudioStore((s) => s.localPlayback);
  const { togglePlay, skipSong, requestSkip } = useSocket();

  const [skipError, setSkipError] = useState('');
  const [skipMsg, setSkipMsg] = useState('');
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const hasPendingSkip = room?.skipRequests?.some((r) => r.requestedBy === mySocketId) ?? false;

  const current = room?.current ?? null;
  const fmLoading = Boolean(room?.randomLoading && !current);

  const isPlaying = room?.isPlaying ?? false;
  const currentTime = useSmoothPlaybackTime();
  const duration = useTrackDuration(current);
  const displayTime = clampPlaybackTime(currentTime, duration);
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const lyrics = useTrackLyrics(current);
  const { current: currentLyric, next: nextLyric } = getActiveLyricPair(lyrics, displayTime);

  const handlePlayPause = () => {
    if (!room) return;
    const next = !room.isPlaying;
    if (!next) {
      localPlayback?.(false);
    }
    togglePlay(next);
    if (next) localPlayback?.(true);
  };

  const handleSeek = (time: number) => seekPlayback?.(time);

  const handleSkip = async () => {
    setSkipError('');
    setSkipMsg('');
    setTrackLoading(true);
    const res = await skipSong();
    if (!res.success) {
      setTrackLoading(false);
      setSkipError(res.error || '切歌失败');
    }
  };

  const handleRequestSkip = async () => {
    setSkipError('');
    setSkipMsg('');
    const res = await requestSkip();
    if (res.success) {
      setSkipMsg('已提交切歌申请');
      setTimeout(() => setSkipMsg(''), 3000);
    } else {
      setSkipError(res.error || '申请失败');
    }
  };



  if (!current && !fmLoading) return null;

  const playerBarClass = transparentBar
    ? 'fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/25 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl [-webkit-backdrop-filter:blur(24px)]'
    : 'fixed bottom-0 left-0 right-0 z-40 glass border-t border-netease-border/50 pb-[env(safe-area-inset-bottom,0px)]';

  if (fmLoading) {
    return (
      <div className={playerBarClass}>
        <div className="py-1.5 -my-1.5">
          <ProgressBar
            progress={0}
            duration={0}
            onSeek={() => {}}
            disabled
            className="h-0.5"
            trackClassName="bg-netease-border"
            fillClassName="bg-netease-red"
          />
        </div>

        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 max-w-[38%] sm:max-w-[32%] min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-lg bg-netease-card">
              <Loader2 className="h-4 w-4 animate-spin text-netease-red" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="truncate text-sm font-medium text-netease-muted">私人漫游</p>
              <p className="truncate text-[11px] text-netease-muted/80 sm:text-xs">正在加载…</p>
            </div>
            <ChevronUp className="h-4 w-4 flex-shrink-0 text-transparent sm:hidden" aria-hidden />
          </div>

          <div className="min-w-0 flex-1 px-1 text-center sm:px-2">
            <p className="truncate text-xs font-medium leading-tight text-netease-muted sm:text-sm">正在加载私人漫游…</p>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-netease-muted/70 sm:text-xs">{'\u00A0'}</p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <span className="hidden text-[10px] text-transparent sm:block">0:00</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" aria-hidden>
              <Play className="ml-0.5 h-4 w-4 text-white/30" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center" aria-hidden>
              <SkipForward className="h-4 w-4 text-white/20" />
            </div>
            <div className="h-8 w-8 flex-shrink-0" aria-hidden />
            <div className="h-8 w-8 flex-shrink-0" aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (

    <div className={playerBarClass}>

      {(skipError || skipMsg) && (

        <p className={`text-center text-[10px] py-0.5 ${skipMsg ? 'text-amber-400' : 'text-netease-red'}`}>
          {skipMsg || skipError}
        </p>

      )}

      <div className="py-1.5 -my-1.5">

        <ProgressBar

          progress={progress}

          duration={duration}

          onSeek={handleSeek}

          disabled={!canControlPlayback}

          className="h-0.5"

          trackClassName="bg-netease-border"

          fillClassName="bg-netease-red"

        />

      </div>



      <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5">

        <button onClick={onExpand} className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 max-w-[38%] sm:max-w-[32%] min-w-0 text-left">

          <img
            src={getCoverUrl(current, 'thumb')}
            alt=""
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover flex-shrink-0"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />

          <div className="min-w-0 hidden sm:block">

            <div className="flex items-center gap-1 sm:gap-1.5">

              <p className="text-sm font-medium truncate">{current.name}</p>

              <SourceBadge source={current.source || 'netease'} className="hidden sm:inline-flex" />

            </div>

            <p className="text-[11px] sm:text-xs text-netease-muted truncate">

              {current.artist}
              {current.requestedBy && (
                <span className="text-netease-muted/70"> · {current.requestedBy}点的歌</span>
              )}

            </p>

          </div>

          <ChevronUp className="w-4 h-4 text-netease-muted flex-shrink-0 sm:hidden" />

        </button>

        <button
          onClick={onExpand}
          className="flex-1 min-w-0 text-center px-1 sm:px-2"
        >
          {currentLyric || nextLyric ? (
            <>
              <p className="text-xs sm:text-sm font-medium truncate leading-tight">
                {currentLyric || '\u00A0'}
              </p>
              <p className="text-[10px] sm:text-xs text-netease-muted truncate leading-tight mt-0.5">
                {nextLyric || '\u00A0'}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs sm:text-sm font-medium truncate leading-tight">{current.name}</p>
              <p className="text-[10px] sm:text-xs text-netease-muted truncate leading-tight mt-0.5">
                {current.artist}
              </p>
            </>
          )}
        </button>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">

        <span className="text-[10px] text-netease-muted hidden sm:block">

          {formatDuration(displayTime)}

          {duration > 0 && ` / ${formatDuration(duration)}`}

        </span>



        <Tooltip content={canControlPlayback ? '暂停/播放' : (isPlaying ? '房主正在播放' : '房主已暂停')}>
          <button
            onClick={canControlPlayback ? handlePlayPause : undefined}
            disabled={trackLoading || !canControlPlayback}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all disabled:opacity-70 ${canControlPlayback ? 'bg-white text-black hover:scale-105' : 'bg-white/10 text-white/70 cursor-not-allowed'}`}
            aria-label="播放控制"
          >
            {trackLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </Tooltip>

        {canControlPlayback ? (
          <Tooltip content="切歌">
            <button
              onClick={handleSkip}
              disabled={trackLoading}
              className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-50"
              aria-label="切歌"
            >
              {trackLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SkipForward className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={hasPendingSkip ? '已申请切歌' : '申请切歌'}>
            <button
              onClick={handleRequestSkip}
              disabled={hasPendingSkip}
              className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-40"
              aria-label="申请切歌"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        <VolumeControl compact className="flex-shrink-0" />
        <FavoriteButton song={current} className="w-8 h-8 text-netease-muted hover:text-rose-300" />

        </div>

      </div>

    </div>

  );

}


