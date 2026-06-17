import { useState } from 'react';
import { Play, Pause, SkipForward, ChevronUp, Loader2 } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';
import { useSocket } from '../hooks/useSocket';

import { formatDuration, getCoverUrl } from '../api/music';
import { useTrackDuration } from '../hooks/useTrackDuration';

import SourceBadge from './SourceBadge';

import ProgressBar from './ProgressBar';



interface Props {

  onExpand: () => void;

}



export default function MiniPlayer({ onExpand }: Props) {

  const room = useRoomStore((s) => s.room);

  const isOwner = useRoomStore((s) => s.isOwner);
  const trackLoading = useAudioStore((s) => s.trackLoading);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const seekPlayback = useAudioStore((s) => s.seekPlayback);
  const { togglePlay, skipSong, requestSkip } = useSocket();

  const [skipError, setSkipError] = useState('');
  const [skipMsg, setSkipMsg] = useState('');
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const hasPendingSkip = room?.skipRequests?.some((r) => r.requestedBy === mySocketId) ?? false;



  const handlePlayPause = () => {
    if (!room) return;
    togglePlay(!room.isPlaying);
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



  if (!room?.current) return null;



  const { current, isPlaying, currentTime } = room;
  const duration = useTrackDuration(current);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;



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

        <button onClick={onExpand} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-left">

          <img

            src={getCoverUrl(current)}

            alt=""

            className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover flex-shrink-0"

          />

          <div className="min-w-0">

            <div className="flex items-center gap-1 sm:gap-1.5">

              <p className="text-sm font-medium truncate">{current.name}</p>

              <SourceBadge source={current.source || 'netease'} className="hidden sm:inline-flex" />

            </div>

            <p className="text-[11px] sm:text-xs text-netease-muted truncate">

              {current.artist}

            </p>

          </div>

          <ChevronUp className="w-4 h-4 text-netease-muted flex-shrink-0" />

        </button>



        <span className="text-[10px] text-netease-muted hidden sm:block">

          {formatDuration(currentTime)}

          {duration > 0 && ` / ${formatDuration(duration)}`}

        </span>



        <button
          onClick={handlePlayPause}
          disabled={trackLoading}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform disabled:opacity-60"
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

      </div>

    </div>

  );

}


