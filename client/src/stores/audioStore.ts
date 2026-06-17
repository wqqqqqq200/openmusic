import { create } from 'zustand';

interface AudioStore {
  trackLoading: boolean;
  setTrackLoading: (loading: boolean) => void;
  /** 歌词解析出的时长（毫秒） */
  lrcDurationMs: number | null;
  lrcTrackKey: string | null;
  setLrcDuration: (trackKey: string | null, ms: number | null) => void;
  /** 音频文件真实时长（毫秒） */
  mediaDurationMs: number | null;
  mediaTrackKey: string | null;
  setMediaDuration: (trackKey: string | null, ms: number | null) => void;
  seekPlayback: ((time: number) => void) | null;
  setSeekPlayback: (fn: ((time: number) => void) | null) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  trackLoading: false,
  setTrackLoading: (trackLoading) => set({ trackLoading }),
  lrcDurationMs: null,
  lrcTrackKey: null,
  setLrcDuration: (lrcTrackKey, lrcDurationMs) => set({ lrcTrackKey, lrcDurationMs }),
  mediaDurationMs: null,
  mediaTrackKey: null,
  setMediaDuration: (mediaTrackKey, mediaDurationMs) => set({ mediaTrackKey, mediaDurationMs }),
  seekPlayback: null,
  setSeekPlayback: (seekPlayback) => set({ seekPlayback }),
}));
