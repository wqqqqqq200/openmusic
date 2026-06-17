import { useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';
import { useSocket } from '../hooks/useSocket';
import { getSongUrl, getLyrics, getDurationFromLrc, getTrackKey } from '../api/music';
import type { QueueItem } from '../types';

function trackKeyOf(song: Pick<QueueItem, 'queueId' | 'id' | 'source'>) {
  return getTrackKey(song);
}

function isNearTrackEnd(audio: HTMLAudioElement): boolean {
  const dur = audio.duration;
  if (!isFinite(dur) || dur <= 0) return true;
  return audio.currentTime >= dur - 1.5;
}

function syncMediaDuration(audio: HTMLAudioElement, trackKey: string) {
  const dur = audio.duration;
  if (!isFinite(dur) || dur <= 0) return;
  useAudioStore.getState().setMediaDuration(trackKey, Math.round(dur * 1000));
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const room = useRoomStore((s) => s.room);
  const setTrackLoading = useAudioStore((s) => s.setTrackLoading);
  const setLrcDuration = useAudioStore((s) => s.setLrcDuration);
  const setMediaDuration = useAudioStore((s) => s.setMediaDuration);
  const setSeekPlayback = useAudioStore((s) => s.setSeekPlayback);
  const { togglePlay, seek, skipSong, syncTime } = useSocket();

  const lastTrackKey = useRef<string | null>(null);
  const readyTrackKey = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const skippingRef = useRef(false);
  const syncing = useRef(false);
  const errorRetries = useRef(0);
  const lastSyncAt = useRef(0);

  const requestSkip = useCallback(() => {
    if (skippingRef.current) return;
    const { isOwner } = useRoomStore.getState();
    if (!isOwner) return;

    skippingRef.current = true;
    audioRef.current?.pause();
    skipSong().finally(() => {
      skippingRef.current = false;
    });
  }, [skipSong]);

  const initAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'auto';

    audio.addEventListener('ended', () => {
      const live = useRoomStore.getState();
      if (!live.isOwner || !live.room?.current) return;
      if (readyTrackKey.current !== trackKeyOf(live.room.current)) return;
      if (!isNearTrackEnd(audio)) return;
      requestSkip();
    });

    audio.addEventListener('error', () => {
      const live = useRoomStore.getState();
      if (!live.isOwner || !live.room?.current || skippingRef.current) return;
      if (readyTrackKey.current !== trackKeyOf(live.room.current)) return;

      if (errorRetries.current < 2) {
        errorRetries.current += 1;
        audio.load();
        audio.play().catch(() => {});
        return;
      }
      requestSkip();
    });

    audio.addEventListener('playing', () => {
      errorRetries.current = 0;
    });

    audio.addEventListener('loadedmetadata', () => {
      const live = useRoomStore.getState().room?.current;
      if (!live || lastTrackKey.current !== trackKeyOf(live)) return;
      syncMediaDuration(audio, lastTrackKey.current);
    });

    audio.addEventListener('durationchange', () => {
      const live = useRoomStore.getState().room?.current;
      if (!live || lastTrackKey.current !== trackKeyOf(live)) return;
      syncMediaDuration(audio, lastTrackKey.current);
    });

    audio.addEventListener('timeupdate', () => {
      if (syncing.current || !audioRef.current) return;
      const { isOwner, room: liveRoom } = useRoomStore.getState();
      if (!isOwner || !liveRoom?.isPlaying) return;
      if (readyTrackKey.current !== trackKeyOf(liveRoom.current!)) return;

      const now = Date.now();
      if (now - lastSyncAt.current < 2000) return;
      lastSyncAt.current = now;
      syncTime(audioRef.current.currentTime);
    });

    audioRef.current = audio;
    return audio;
  }, [requestSkip, syncTime]);

  useEffect(() => {
    const gen = ++loadGeneration.current;
    const audio = initAudio();
    const current = room?.current;

    if (!current) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      lastTrackKey.current = null;
      readyTrackKey.current = null;
      errorRetries.current = 0;
      setTrackLoading(false);
      setLrcDuration(null, null);
      setMediaDuration(null, null);
      return;
    }

    const trackKey = trackKeyOf(current);
    const isNewTrack = lastTrackKey.current !== trackKey;

    const loadAndPlay = async () => {
      if (isNewTrack) {
        audio.pause();
        audio.currentTime = 0;
        readyTrackKey.current = null;
        errorRetries.current = 0;
        lastTrackKey.current = trackKey;
        setTrackLoading(true);
        setLrcDuration(null, null);
        setMediaDuration(null, null);

        if (!current.duration) {
          getLyrics({
            id: current.id,
            source: current.source || 'netease',
            name: current.name,
            lrc: current.lrc,
          })
            .then((lrc) => {
              if (gen !== loadGeneration.current) return;
              const ms = getDurationFromLrc(lrc, current.duration);
              if (ms) setLrcDuration(trackKey, ms);
            })
            .catch(() => {});
        }

        try {
          let url: string | null = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              url = await getSongUrl({
                id: current.id,
                source: current.source || 'netease',
                url: current.url,
              });
              break;
            } catch (retryErr) {
              if (attempt === 1) throw retryErr;
            }
          }
          if (!url) throw new Error('empty url');
          if (gen !== loadGeneration.current) return;

          audio.pause();
          audio.src = url;
          await audio.load();
          if (gen !== loadGeneration.current) return;

          syncMediaDuration(audio, trackKey);
          readyTrackKey.current = trackKey;
        } catch (err) {
          console.error('Failed to load song:', err);
          if (gen !== loadGeneration.current) return;
          setTrackLoading(false);
          readyTrackKey.current = null;
          requestSkip();
          return;
        }
      }

      if (gen !== loadGeneration.current) return;
      if (readyTrackKey.current !== trackKey) return;

      const liveRoom = useRoomStore.getState().room;
      if (!liveRoom?.current || trackKeyOf(liveRoom.current) !== trackKey) return;

      syncing.current = true;
      const startAt = Math.max(0, liveRoom.currentTime || 0);
      const dur = audio.duration;
      audio.currentTime = isFinite(dur) && dur > 0 ? Math.min(startAt, dur - 0.25) : startAt;

      if (liveRoom.isPlaying) {
        try {
          await audio.play();
          syncTime(audio.currentTime);
          lastSyncAt.current = Date.now();
        } catch {
          // autoplay blocked
        }
      } else {
        audio.pause();
      }

      setTrackLoading(false);
      setTimeout(() => { syncing.current = false; }, 300);
    };

    loadAndPlay();
  }, [
    room?.current?.id,
    room?.current?.queueId,
    room?.current?.source,
    initAudio,
    requestSkip,
    syncTime,
    setTrackLoading,
    setLrcDuration,
    setMediaDuration,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    const current = room?.current;
    if (!audio || !current) return;

    const trackKey = trackKeyOf(current);
    if (readyTrackKey.current !== trackKey) return;

    if (room.isPlaying && audio.paused) {
      audio.play().catch(() => {});
    } else if (!room.isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [room?.isPlaying, room?.current?.queueId, room?.current?.id, room?.current?.source]);

  const handlePlayPause = useCallback(() => {
    if (!room) return;
    togglePlay(!room.isPlaying);
  }, [room, togglePlay]);

  const handleSeek = useCallback((time: number) => {
    seek(time);
    if (audioRef.current && readyTrackKey.current) {
      syncing.current = true;
      const dur = audioRef.current.duration;
      const target = isFinite(dur) && dur > 0 ? Math.min(time, dur - 0.25) : time;
      audioRef.current.currentTime = target;
      syncTime(target);
      lastSyncAt.current = Date.now();
      setTimeout(() => { syncing.current = false; }, 300);
    }
  }, [seek, syncTime]);

  useEffect(() => {
    setSeekPlayback(handleSeek);
    return () => setSeekPlayback(null);
  }, [handleSeek, setSeekPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    const current = room?.current;
    if (!audio || !current) return;

    const trackKey = trackKeyOf(current);
    if (readyTrackKey.current !== trackKey) return;

    const target = room.currentTime ?? 0;
    if (Math.abs(target - audio.currentTime) <= 2) return;

    syncing.current = true;
    const dur = audio.duration;
    audio.currentTime = isFinite(dur) && dur > 0 ? Math.min(target, dur - 0.25) : target;
    setTimeout(() => { syncing.current = false; }, 300);
  }, [room?.currentTime, room?.current?.queueId, room?.current?.id, room?.current?.source]);

  const handleSkip = useCallback(() => {
    readyTrackKey.current = null;
    requestSkip();
  }, [requestSkip]);

  return { handlePlayPause, handleSeek, handleSkip, audioRef };
}

