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



interface Props {

  onExpand: () => void;

}



export default function MiniPlayer({ onExpand }: Props) {

  const room = useRoomStore((s) => s.room);

  const isOwner = useRoomStore((s) => s.isOwner);
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



  if (!current) return null;

  return (

    <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-netease-border/50 pb-[env(safe-area-inset-bottom,0px)]">

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

          disabled={!isOwner}

          className="h-0.5"

          trackClassName="bg-netease-border"

          fillClassName="bg-netease-red"

        />

      </div>



      <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5">

        <button onClick={onExpand} className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 max-w-[38%] sm:max-w-[32%] min-w-0 text-left">

          <img

            src={getCoverUrl(current)}

            alt=""

            className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover flex-shrink-0"

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



        <button
          onClick={isOwner ? handlePlayPause : undefined}
          disabled={trackLoading || !isOwner}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-all disabled:opacity-70 ${isOwner ? 'bg-white text-black hover:scale-105' : 'bg-white/10 text-white/70 cursor-not-allowed'}`}
          title={isOwner ? '暂停/播放' : (isPlaying ? '房主正在播放' : '房主已暂停')}
        >
          {trackLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {isOwner ? (
          <button
            onClick={handleSkip}
            disabled={trackLoading}
            className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-50"
            title="切歌"
          >
            {trackLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SkipForward className="w-4 h-4" />
            )}
          </button>
        ) : (
          <button
            onClick={handleRequestSkip}
            disabled={hasPendingSkip}
            className="w-8 h-8 flex items-center justify-center text-netease-muted hover:text-white transition-colors disabled:opacity-40"
            title={hasPendingSkip ? '已申请切歌' : '申请切歌'}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        )}

        <VolumeControl compact className="flex-shrink-0" />
        <FavoriteButton song={current} className="w-8 h-8 text-netease-muted hover:text-rose-300" />

        </div>

      </div>

    </div>

  );

}


