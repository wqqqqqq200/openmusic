import { useEffect, useState } from 'react';

import {
  ChevronDown, Play, Pause, SkipForward, Loader2,
} from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';

import { useSocket } from '../hooks/useSocket';

import { getLyrics, parseLrc, formatDuration, getCoverUrl, getDurationFromLrc, getTrackKey } from '../api/music';
import { useTrackDuration } from '../hooks/useTrackDuration';

import type { LyricLine } from '../types';

import Lyrics from './Lyrics';
import VinylPlayer from './VinylPlayer';
import SongInfoPanel from './SongInfoPanel';

import ProgressBar from './ProgressBar';



interface Props {

  onClose: () => void;

}



export default function PlayerPage({ onClose }: Props) {

  const room = useRoomStore((s) => s.room);

  const isOwner = useRoomStore((s) => s.isOwner);
  const trackLoading = useAudioStore((s) => s.trackLoading);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const setLrcDuration = useAudioStore((s) => s.setLrcDuration);
  const seekPlayback = useAudioStore((s) => s.seekPlayback);
  const { togglePlay, skipSong, requestSkip } = useSocket();

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);

  const [bgLoaded, setBgLoaded] = useState(false);

  const [skipError, setSkipError] = useState('');
  const [skipMsg, setSkipMsg] = useState('');
  const mySocketId = useRoomStore((s) => s.mySocketId);



  const current = room?.current;

  const isPlaying = room?.isPlaying ?? false;

  const currentTime = room?.currentTime ?? 0;

  const duration = useTrackDuration(current ?? null);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const hasPendingSkip = room?.skipRequests?.some((r) => r.requestedBy === mySocketId) ?? false;



  const handlePlayPause = () => togglePlay(!isPlaying);



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



  useEffect(() => {

    if (!current) return;

    setLyrics([]);

    getLyrics({

      id: current.id,

      source: current.source || 'netease',

      name: current.name,

      lrc: current.lrc,

    })

      .then((lrc) => {
        const lines = parseLrc(lrc);
        setLyrics(lines);
        if (!current.duration) {
          const ms = getDurationFromLrc(lrc, current.duration);
          if (ms) setLrcDuration(getTrackKey(current), ms);
        }
      })

      .catch(() => setLyrics([]));

  }, [current?.id, current?.source, current?.name, current?.lrc, current?.duration, setLrcDuration]);



  if (!current) return null;



  const coverUrl = getCoverUrl(current);



  return (

    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in">

      <div

        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-110"

        style={{

          backgroundImage: bgLoaded ? `url(${coverUrl})` : undefined,

          filter: 'blur(60px) brightness(0.35)',

        }}

      />

      <img src={coverUrl} alt="" className="hidden" onLoad={() => setBgLoaded(true)} />

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />



      <header className="relative z-10 flex items-center px-4 py-3 2xl:px-8 2xl:py-6 flex-shrink-0">

        <button

          onClick={onClose}

          className="w-10 h-10 2xl:w-16 2xl:h-16 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"

        >

          <ChevronDown className="w-6 h-6 2xl:w-10 2xl:h-10" />

        </button>

        <div className="flex-1" />

        <div className="w-10 2xl:w-16" />

      </header>



      <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 px-4 lg:px-12 2xl:px-24 gap-4 lg:gap-8 2xl:gap-16">

        <div className="flex-shrink-0 lg:flex-1 flex items-center justify-center py-2 lg:py-8 2xl:py-16">

          <VinylPlayer coverUrl={coverUrl} isPlaying={isPlaying} size="large" />

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

            currentTime={currentTime}

            onSeek={isOwner ? handleSeek : undefined}

            variant="side"

            size="large"

          />

        </div>

      </div>



      <footer className="relative z-10 px-6 pb-6 pt-3 flex-shrink-0 2xl:px-12 2xl:pb-12 2xl:pt-6">

        <div className="mb-2 flex justify-between text-sm 2xl:text-xl text-white/50">

          <span>{formatDuration(currentTime)}</span>

          <span>{duration > 0 ? formatDuration(duration) : '--:--'}</span>

        </div>



        <div className="mb-4 py-2 -my-2 2xl:mb-8">

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

        <div className="flex items-center justify-center gap-10 2xl:gap-16">

          <div className="w-12 2xl:w-20" />

          <button
            onClick={handlePlayPause}
            disabled={trackLoading}
            className="w-16 h-16 2xl:w-24 2xl:h-24 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform shadow-lg shadow-black/30 disabled:opacity-60"
          >
            {trackLoading ? (
              <Loader2 className="w-7 h-7 2xl:w-10 2xl:h-10 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7 2xl:w-10 2xl:h-10" />
            ) : (
              <Play className="w-7 h-7 2xl:w-10 2xl:h-10 ml-0.5 2xl:ml-1" />
            )}
          </button>

          {isOwner ? (
            <button
              onClick={handleSkip}
              disabled={trackLoading}
              className="w-12 h-12 2xl:w-20 2xl:h-20 flex items-center justify-center text-white/70 hover:text-white transition-colors disabled:opacity-50"
              title="切歌"
            >
              {trackLoading ? (
                <Loader2 className="w-6 h-6 2xl:w-8 2xl:h-8 animate-spin" />
              ) : (
                <SkipForward className="w-6 h-6 2xl:w-8 2xl:h-8" />
              )}
            </button>
          ) : (
            <button
              onClick={handleRequestSkip}
              disabled={hasPendingSkip}
              className="w-12 h-12 2xl:w-20 2xl:h-20 flex items-center justify-center text-white/70 hover:text-white transition-colors disabled:opacity-40"
              title={hasPendingSkip ? '已申请切歌' : '申请切歌'}
            >
              <SkipForward className="w-6 h-6 2xl:w-8 2xl:h-8" />
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


