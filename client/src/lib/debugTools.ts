import { useAudioStore } from '../stores/audioStore';
import { useRoomStore } from '../stores/roomStore';
import { getSharedAudio } from './audioElement';
import { getClientId } from './clientId';
import { getClientPlaybackState, getPlaybackTime } from './playbackState';

const DEBUG_FLAG_KEY = 'openmusic:debug';
const DEBUG_INTERVAL_MS = 2000;
const MAX_EVENTS = 80;

type DebugEvent = {
  at: string;
  name: string;
  data?: unknown;
};

type SocketSnapshot = {
  id?: string;
  connected?: boolean;
  transport?: string;
};

const state = {
  enabled: false,
  timer: 0,
  events: [] as DebugEvent[],
  getSocket: null as null | (() => SocketSnapshot | null),
};

function nowLabel(): string {
  return new Date().toISOString().slice(11, 23);
}

function safeNumber(value: number | undefined): number | null {
  return Number.isFinite(value) ? Number(value!.toFixed(3)) : null;
}

function audioSnapshot() {
  const audio = getSharedAudio();
  return {
    src: audio.currentSrc || audio.src || '',
    paused: audio.paused,
    ended: audio.ended,
    currentTime: safeNumber(audio.currentTime),
    duration: safeNumber(audio.duration),
    readyState: audio.readyState,
    networkState: audio.networkState,
    playbackRate: audio.playbackRate,
    volume: audio.volume,
    muted: audio.muted,
    error: audio.error ? {
      code: audio.error.code,
      message: audio.error.message,
    } : null,
  };
}

function roomSnapshot() {
  const { room, nickname, mySocketId, myConnectionId, isOwner, showPlayer, exitReason } = useRoomStore.getState();
  return {
    roomId: room?.id || null,
    roomName: room?.name || null,
    nickname,
    mySocketId,
    myConnectionId,
    isOwner,
    showPlayer,
    exitReason,
    ownerId: room?.ownerId || null,
    creatorId: room?.creatorId || null,
    isPlaying: room?.isPlaying ?? null,
    currentTime: safeNumber(room?.currentTime),
    randomLoading: room?.randomLoading ?? null,
    users: room?.users?.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      location: user.location,
      readOnly: user.readOnly,
    })) || [],
    current: room?.current ? {
      queueId: room.current.queueId,
      id: room.current.id,
      source: room.current.source,
      name: room.current.name,
      duration: room.current.duration,
    } : null,
    queueLength: room?.queue?.length ?? 0,
    messages: room?.messages?.length ?? 0,
  };
}

function playbackSnapshot() {
  const playbackState = getClientPlaybackState();
  const audio = useAudioStore.getState();
  return {
    clientId: getClientId(),
    documentHidden: document.hidden,
    visibilityState: document.visibilityState,
    online: navigator.onLine,
    audioStore: {
      trackLoading: audio.trackLoading,
      needsAudioUnlock: audio.needsAudioUnlock,
      smoothPlaybackTime: safeNumber(audio.smoothPlaybackTime),
      playbackVersion: audio.playbackVersion,
      lrcTrackKey: audio.lrcTrackKey,
      lrcDurationMs: audio.lrcDurationMs,
      mediaTrackKey: audio.mediaTrackKey,
      mediaDurationMs: audio.mediaDurationMs,
      volume: audio.volume,
      hasSeekPlayback: Boolean(audio.seekPlayback),
      hasLocalPlayback: Boolean(audio.localPlayback),
      hasRetryPlayback: Boolean(audio.retryPlayback),
    },
    playbackState: playbackState ? {
      roomId: playbackState.roomId,
      version: playbackState.version,
      trackId: playbackState.trackId,
      status: playbackState.status,
      positionSec: safeNumber(playbackState.positionSec),
      derivedTime: safeNumber(getPlaybackTime(playbackState)),
      updatedAt: playbackState.updatedAt,
    } : null,
  };
}

export function getDebugSnapshot() {
  return {
    at: new Date().toISOString(),
    page: {
      href: location.href,
      userAgent: navigator.userAgent,
    },
    socket: state.getSocket?.() || null,
    room: roomSnapshot(),
    playback: playbackSnapshot(),
    audio: audioSnapshot(),
    recentEvents: state.events.slice(-20),
  };
}

export function debugLog(name: string, data?: unknown): void {
  const event = { at: nowLabel(), name, data };
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  if (state.enabled) console.log(`[openmusic:${name}]`, data ?? '');
}

function printSnapshot(reason = 'tick'): void {
  console.groupCollapsed(`[openmusic:debug] ${reason} ${nowLabel()}`);
  console.log(getDebugSnapshot());
  console.groupEnd();
}

export function setDebugSocketProvider(provider: () => SocketSnapshot | null): void {
  state.getSocket = provider;
}

export function enableOpenMusicDebug(): void {
  if (state.enabled) {
    printSnapshot('already-on');
    return;
  }
  state.enabled = true;
  localStorage.setItem(DEBUG_FLAG_KEY, '1');
  printSnapshot('enabled');
  state.timer = window.setInterval(() => printSnapshot(), DEBUG_INTERVAL_MS);
}

export function disableOpenMusicDebug(): void {
  state.enabled = false;
  localStorage.removeItem(DEBUG_FLAG_KEY);
  if (state.timer) window.clearInterval(state.timer);
  state.timer = 0;
  console.log('[openmusic:debug] disabled');
}

export function installOpenMusicDebug(): void {
  const target = window as typeof window & {
    debug?: () => void;
    debugOff?: () => void;
    debugNow?: () => void;
    openMusicDebug?: {
      on: () => void;
      off: () => void;
      now: () => void;
      snapshot: typeof getDebugSnapshot;
      event: typeof debugLog;
    };
  };

  target.debug = enableOpenMusicDebug;
  target.debugOff = disableOpenMusicDebug;
  target.debugNow = () => printSnapshot('manual');
  target.openMusicDebug = {
    on: enableOpenMusicDebug,
    off: disableOpenMusicDebug,
    now: target.debugNow,
    snapshot: getDebugSnapshot,
    event: debugLog,
  };

  window.addEventListener('visibilitychange', () => debugLog('visibilitychange', {
    hidden: document.hidden,
    visibilityState: document.visibilityState,
  }));
  window.addEventListener('online', () => debugLog('online'));
  window.addEventListener('offline', () => debugLog('offline'));
  window.addEventListener('error', (event) => debugLog('window-error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  }));
  window.addEventListener('unhandledrejection', (event) => debugLog('unhandled-rejection', String(event.reason)));

  if (localStorage.getItem(DEBUG_FLAG_KEY) === '1') enableOpenMusicDebug();
}