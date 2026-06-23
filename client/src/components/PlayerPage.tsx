import { useState } from 'react';

import {
  ChevronDown, Play, Pause, SkipForward, Loader2,
} from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';

import { useSocket } from '../hooks/useSocket';

import { formatDuration, getCoverUrl } from '../api/music';
import { useTrackDuration, clampPlaybackTime } from '../hooks/useTrackDuration';
import { useSmoothPlaybackTime } from '../hooks/useSmoothPlaybackTime';
import { useTrackLyrics } from '../hooks/useTrackLyrics';

import Lyrics from './Lyrics';
import VinylPlayer from './VinylPlayer';
import SongInfoPanel from './SongInfoPanel';

import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import FavoriteButton from './FavoriteButton';



interface Props {

  onClose: () => void;

}



export default function PlayerPage({ onClose }: Props) {

  const room = useRoomStore((s) => s.room);

  const isOwner = useRoomStore((s) => s.isOwner);
  const trackLoading = useAudioStore((s) => s.trackLoading);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const seekPlayback = useAudioStore((s) => s.seekPlayback);
  const localPlayback = useAudioStore((s) => s.localPlayback);
  const { togglePlay, skipSong, requestSkip } = useSocket();

  const [bgLoaded, setBgLoaded] = useState(false);

  const [skipError, setSkipError] = useState('');
  const [skipMsg, setSkipMsg] = useState('');
  const mySocketId = useRoomStore((s) => s.mySocketId);



  const current = room?.current;
  const lyrics = useTrackLyrics(current);

  const isPlaying = room?.isPlaying ?? false;

  const currentTime = useSmoothPlaybackTime();

  const duration = useTrackDuration(current ?? null);
  const displayTime = clampPlaybackTime(currentTime, duration);
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;

  const hasPendingSkip = room?.skipRequests?.some((r) => r.requestedBy === mySocketId) ?? false;



  const handlePlayPause = () => {
    const next = !isPlaying;
    if (!next && room) {
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
      setSkipMsg('已提交切歌申请，等待房主同意');
      setTimeout(() => setSkipMsg(''), 3000);
    } else {
      setSkipError(res.error || '申请失败');
    }
  };



  if (!current) return null;



  const coverUrl = getCoverUrl(current);



  return (

    <div className="fixed inset-0 z-[60] flex flex-col animate-fade-in overflow-hidden isolate">

      {/* 不透底层，完全挡住点歌页 */}
      <div className="absolute inset-0 bg-[#0d0d0d]" aria-hidden />

      <div
        className="absolute inset-0 bg-cover bg-center scale-110 opacity-30"
        style={{
          backgroundImage: bgLoaded ? `url(${coverUrl})` : undefined,
          filter: 'blur(48px) saturate(1.15)',
        }}
        aria-hidden
      />

      <img src={coverUrl} alt="" className="hidden" onLoad={() => setBgLoaded(true)} />

      {/* 全屏毛玻璃 */}
      <div
        className="absolute inset-0 bg-[#141414]/90 backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)]"
        aria-hidden
      />

      <div
        className="absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/50 pointer-events-none"
        aria-hidden
      />

      <header className="relative z-10 flex items-center px-3 py-2 sm:px-4 sm:py-3 2xl:px-8 2xl:py-6 flex-shrink-0">

        <button

          onClick={onClose}

          className="w-9 h-9 sm:w-10 sm:h-10 2xl:w-16 2xl:h-16 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"

        >

          <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-10 2xl:h-10" />

        </button>

        <div className="flex-1" />

        <div className="w-10 2xl:w-16" />

      </header>



      <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 px-3 sm:px-4 lg:px-12 2xl:px-24 gap-1 sm:gap-4 lg:gap-8 2xl:gap-16">

        <div className="flex-shrink-0 lg:flex-1 flex items-center justify-center py-0 sm:py-2 lg:py-8 2xl:py-16">

          <VinylPlayer coverUrl={coverUrl} isPlaying={isPlaying} size="large" className="scale-[0.92] sm:scale-100 origin-center" />

        </div>



        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          <SongInfoPanel
            name={current.name}
            artist={current.artist}
            source={current.source || 'netease'}
            requestedBy={current.requestedBy}
            size="large"
          />

          <Lyrics

            lines={lyrics}

            currentTime={displayTime}

            onSeek={isOwner ? handleSeek : undefined}

            variant="side"

            size="large"

          />

        </div>

      </div>



      <footer className="relative z-10 px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 flex-shrink-0 2xl:px-12 2xl:pb-12 2xl:pt-6">

        <div className="mb-1.5 sm:mb-2 flex justify-between text-xs sm:text-sm 2xl:text-xl text-white/50">

          <span>{formatDuration(displayTime)}</span>

          <span>{duration > 0 ? formatDuration(duration) : '--:--'}</span>

        </div>



        <div className="mb-2 sm:mb-4 py-1 sm:py-2 -my-1 sm:-my-2 2xl:mb-8">

          <ProgressBar

            progress={progress}

            duration={duration}

            onSeek={handleSeek}

            disabled={!isOwner}

            className="h-1.5 2xl:h-2.5"

            trackClassName="bg-white/20"

            fillClassName="bg-white"

            thumbClassName="w-3 h-3 2xl:w-5 2xl:h-5"

            showThumb

          />

        </div>

        <div className="flex items-center justify-center gap-8 sm:gap-10 2xl:gap-16">

          <VolumeControl
            compact
            iconClassName="w-4 h-4 sm:w-5 sm:h-5 2xl:w-7 2xl:h-7"
            sliderClassName="h-20 sm:h-24 2xl:h-32"
            buttonClassName="w-10 h-10 sm:w-12 sm:h-12 2xl:w-20 2xl:h-20 text-white/70 hover:text-white"
          />

          <FavoriteButton
            song={current}
            className="w-10 h-10 sm:w-12 sm:h-12 2xl:w-20 2xl:h-20 text-white/70 hover:text-rose-300"
            iconClassName="w-5 h-5 sm:w-6 sm:h-6 2xl:w-8 2xl:h-8"
          />

          <button
            onClick={isOwner ? handlePlayPause : undefined}
            disabled={trackLoading || !isOwner}
            className={`w-14 h-14 sm:w-16 sm:h-16 2xl:w-24 2xl:h-24 flex items-center justify-center rounded-full transition-all shadow-lg shadow-black/30 disabled:opacity-80 ${isOwner ? 'bg-white text-black hover:scale-105' : 'bg-white/10 text-white/70 cursor-not-allowed'}`}
            title={isOwner ? '暂停/播放' : (isPlaying ? '房主正在播放' : '房主已暂停')}
          >
            {trackLoading ? (
              <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 2xl:w-10 2xl:h-10 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6 sm:w-7 sm:h-7 2xl:w-10 2xl:h-10" />
            ) : (
              <Play className="w-6 h-6 sm:w-7 sm:h-7 2xl:w-10 2xl:h-10 ml-0.5 2xl:ml-1" />
            )}
          </button>

          {isOwner ? (
            <button
              onClick={handleSkip}
              disabled={trackLoading}
              className="w-10 h-10 sm:w-12 sm:h-12 2xl:w-20 2xl:h-20 flex items-center justify-center text-white/70 hover:text-white transition-colors disabled:opacity-50"
              title="切歌"
            >
              {trackLoading ? (
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-8 2xl:h-8 animate-spin" />
              ) : (
                <SkipForward className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-8 2xl:h-8" />
              )}
            </button>
          ) : (
            <button
              onClick={handleRequestSkip}
              disabled={hasPendingSkip}
              className="w-10 h-10 sm:w-12 sm:h-12 2xl:w-20 2xl:h-20 flex items-center justify-center text-white/70 hover:text-white transition-colors disabled:opacity-40"
              title={hasPendingSkip ? '已申请切歌' : '申请切歌'}
            >
              <SkipForward className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-8 2xl:h-8" />
            </button>
          )}

        </div>



        {(skipError || skipMsg) && (

          <p className={`text-center text-xs 2xl:text-base mt-2 2xl:mt-4 ${skipMsg ? 'text-amber-300' : 'text-red-300'}`}>
            {skipMsg || skipError}
          </p>

        )}

      </footer>

    </div>

  );

}


