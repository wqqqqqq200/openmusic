import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Music2 } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';
import { useSocket } from '../hooks/useSocket';
import { useTrackDuration } from '../hooks/useTrackDuration';
import {
  getLyrics, parseLrc, formatDuration, getCoverUrl,
  getDurationFromLrc, getTrackKey,
} from '../api/music';
import type { LyricLine } from '../types';
import Lyrics from '../components/Lyrics';
import VinylPlayer from '../components/VinylPlayer';
import SongInfoPanel from '../components/SongInfoPanel';
import ProgressBar from '../components/ProgressBar';

export default function TvDisplay() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const room = useRoomStore((s) => s.room);
  const { joinRoom } = useSocket();
  const setLrcDuration = useAudioStore((s) => s.setLrcDuration);

  const [joinError, setJoinError] = useState('');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [bgLoaded, setBgLoaded] = useState(false);

  const current = room?.current;
  const isPlaying = room?.isPlaying ?? false;
  const currentTime = room?.currentTime ?? 0;
  const duration = useTrackDuration(current ?? null);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  useEffect(() => {
    if (!roomId) return;
    joinRoom(roomId, '电视机').then((res) => {
      if (!res.success) {
        setJoinError(res.error || '无法连接房间');
        setTimeout(() => navigate('/'), 3000);
      }
    });
  }, [roomId, joinRoom, navigate]);

  useEffect(() => {
    if (!current) {
      setLyrics([]);
      return;
    }

    setLyrics([]);
    setBgLoaded(false);

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

  if (joinError) {
    return (
      <div className="h-full flex items-center justify-center bg-[#080808]">
        <p className="text-netease-red text-sm">{joinError}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#080808] gap-3">
        <Loader2 className="w-8 h-8 text-netease-red animate-spin" />
        <p className="text-white/40 text-sm">正在连接...</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="h-full w-full overflow-hidden bg-[#080808] select-none">
        <div className="h-full flex flex-col items-center justify-center animate-fade-in px-6">
          <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center mb-4">
            <Music2 className="w-7 h-7 text-white/20" />
          </div>
          <p className="text-base font-light text-white/50 mb-1">等待点播</p>
          <p className="text-xs text-white/25 text-center">
            {room.queue.length > 0
              ? `队列中有 ${room.queue.length} 首歌曲即将播放`
              : '在手机上搜索并点歌吧'}
          </p>
        </div>
      </div>
    );
  }

  const coverUrl = getCoverUrl(current);

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in select-none">
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-110"
        style={{
          backgroundImage: bgLoaded ? `url(${coverUrl})` : undefined,
          filter: 'blur(60px) brightness(0.35)',
        }}
      />
      <img src={coverUrl} alt="" className="hidden" onLoad={() => setBgLoaded(true)} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 px-4 lg:px-12 gap-4 lg:gap-10">
        <div className="flex-shrink-0 lg:flex-1 flex items-center justify-center py-2 lg:py-8">
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
          <Lyrics lines={lyrics} currentTime={currentTime} variant="side" size="large" />
        </div>
      </div>

      <footer className="relative z-10 px-8 pb-8 pt-3 flex-shrink-0">
        <div className="mb-2 flex justify-between text-xs lg:text-sm text-white/50">
          <span>{formatDuration(currentTime)}</span>
          <span className="flex items-center gap-2">
            {!isPlaying && <span className="text-amber-400/80">已暂停</span>}
            {duration > 0 ? formatDuration(duration) : '--:--'}
          </span>
        </div>

        <div className="py-2 -my-2">
          <ProgressBar
            progress={progress}
            duration={duration}
            onSeek={() => {}}
            disabled
            className="h-1"
            trackClassName="bg-white/20"
            fillClassName="bg-white"
          />
        </div>
      </footer>
    </div>
  );
}
