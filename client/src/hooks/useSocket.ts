import { useEffect, useRef, useCallback } from 'react';

import { io, Socket } from 'socket.io-client';

import { useRoomStore } from '../stores/roomStore';
import { useAudioStore } from '../stores/audioStore';

import type { ChatMention, ChatReplyRef, ChatMessage, FavoriteSong, PlaybackState, RoomState, Song } from '../types';

import { stopSharedAudio } from '../lib/audioElement';
import { prefetchCurrentSong } from '../lib/songPreloadCache';
import { resetPlaybackStateCache } from '../lib/playbackState';
import {
  schedulePlaybackState,
  seedPlaybackFromRoom,
  resetPlaybackScheduling,
} from '../lib/playbackSchedule';
import { getClientId, getClientToken, rememberClientIdentity } from '../lib/clientId';
import { debugLog, setDebugSocketProvider } from '../lib/debugTools';



let socket: Socket | null = null;
let socketListenersAttached = false;
let socketConnectRequested = false;

const SOCKET_ACK_TIMEOUT_MS = 8000;

type JoinSession = {
  roomId: string;
  nickname: string;
  password?: string;
  readOnly?: boolean;
};

let lastJoinSession: JoinSession | null = null;
let rejoinInFlight = false;
let joinGeneration = 0;



function getSocket(): Socket {

  if (!socket) {

    socket = io({

      transports: ['websocket', 'polling'],

      autoConnect: false,

    });

  }

  return socket;

}


function emitWithAck<TResponse>(
  event: string,
  payload: unknown,
  fallback: TResponse,
): Promise<TResponse> {
  return new Promise((resolve) => {
    getSocket().timeout(SOCKET_ACK_TIMEOUT_MS).emit(
      event,
      payload,
      (err: Error | null, res: TResponse | undefined) => {
        resolve(err || !res ? fallback : res);
      },
    );
  });
}

function joinPayload(session: JoinSession) {
  return {
    roomId: session.roomId,
    nickname: session.nickname,
    password: session.password?.trim() || undefined,
    readOnly: Boolean(session.readOnly),
    clientId: getClientId(),
    clientToken: getClientToken(),
  };
}

function rejoinLastRoom() {
  const session = lastJoinSession;
  const currentRoom = useRoomStore.getState().room;
  if (!session || !currentRoom || rejoinInFlight) return;

  rejoinInFlight = true;
  getSocket().timeout(SOCKET_ACK_TIMEOUT_MS).emit(
    'join_room',
    joinPayload(session),
    (
      err: Error | null,
      res: {
        success: boolean;
        room?: RoomState;
        socketId?: string;
        connectionId?: string;
        clientId?: string;
        clientToken?: string;
        isOwner?: boolean;
      } | undefined,
    ) => {
      rejoinInFlight = false;
      if (err || !res?.success || !res.room) return;

      useRoomStore.getState().setRoom(res.room);
      seedPlaybackFromRoom(res.room);
      rememberClientIdentity(res.clientId || res.socketId, res.clientToken);
      if (res.socketId) {
        useRoomStore.getState().setConnectionInfo(res.socketId, Boolean(res.isOwner), res.connectionId || null);
      }
      if (res.room.current) {
        prefetchCurrentSong(res.room.current);
      }
    },
  );
}



export function useSocket() {

  const setRoom = useRoomStore((s) => s.setRoom);

  const setConnectionInfo = useRoomStore((s) => s.setConnectionInfo);

  const resetSession = useRoomStore((s) => s.resetSession);

  const connected = useRef(false);



  useEffect(() => {

    const s = getSocket();

        setDebugSocketProvider(() => ({
      id: s.id,
      connected: s.connected,
      transport: s.io.engine?.transport?.name,
    }));
if (socketListenersAttached) return;
    socketListenersAttached = true;



    const onRoomUpdate = (room: RoomState) => {
      debugLog('room_update', {
        roomId: room.id,
        current: room.current?.queueId || null,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
        users: room.users.length,
        randomLoading: room.randomLoading,
      });
      const { mySocketId, myConnectionId } = useRoomStore.getState();
      const isOwner = Boolean(mySocketId && room.ownerId === mySocketId);

      useRoomStore.getState().setRoom(room);

      if (mySocketId) {
        useRoomStore.getState().setConnectionInfo(mySocketId, isOwner, myConnectionId);
      }
    };

    const onPlaybackState = (state: PlaybackState) => {
      schedulePlaybackState(state);
    };



    const onChatMessage = (message: ChatMessage) => {

      const current = useRoomStore.getState().room;

      if (!current) return;

      if (current.messages.some((m) => m.id === message.id)) return;

      useRoomStore.getState().setRoom({ ...current, messages: [...current.messages, message] });

    };

    const onKicked = ({ message }: { message?: string }) => {
      joinGeneration += 1;
      lastJoinSession = null;
      stopSharedAudio();
      resetPlaybackScheduling();
      resetPlaybackStateCache();
      useAudioStore.getState().setPlaybackVersion(0);
      useAudioStore.getState().setTrackLoading(false);
      useAudioStore.getState().setNeedsAudioUnlock(false);
      useAudioStore.getState().setSmoothPlaybackTime(0);
      resetSession();
      useRoomStore.getState().setExitReason(
        message || '你已被房主移出房间，无法再次进入',
      );
    };



    s.on('room_update', onRoomUpdate);

    s.on('playback_state', onPlaybackState);

    s.on('chat_message', onChatMessage);

    s.on('kicked', onKicked);

    s.on('connect', () => {
      debugLog('socket_connect', { id: s.id, transport: s.io.engine?.transport?.name });
      rejoinLastRoom();
    });
    s.on('disconnect', (reason) => {
      debugLog('socket_disconnect', { reason });
      useRoomStore.getState().setConnectionInfo(useRoomStore.getState().mySocketId, false, null);
    });
    s.on('connect_error', (err) => {
      debugLog('socket_connect_error', { message: err?.message });
      useRoomStore.getState().setConnectionInfo(useRoomStore.getState().mySocketId, false, null);
    });

  }, [setRoom, setConnectionInfo, resetSession]);



  const connect = useCallback(() => {

    const s = getSocket();

        setDebugSocketProvider(() => ({
      id: s.id,
      connected: s.connected,
      transport: s.io.engine?.transport?.name,
    }));
if (!connected.current && !socketConnectRequested) {

      s.connect();

      connected.current = true;
      socketConnectRequested = true;

    }

  }, []);



  const joinRoom = useCallback(

    (
      roomId: string,
      nickname: string,
      password?: string,
      options: { readOnly?: boolean } = {},
    ): Promise<{ success: boolean; error?: string; needsPassword?: boolean; room?: RoomState }> => {
      connect();
      const session: JoinSession = {
        roomId,
        nickname,
        password,
        readOnly: Boolean(options.readOnly),
      };
      const generation = ++joinGeneration;

      return emitWithAck<{
        success: boolean;
        error?: string;
        needsPassword?: boolean;
        room?: RoomState;
        socketId?: string;
        connectionId?: string;
        clientId?: string;
        clientToken?: string;
        isOwner?: boolean;
      }>('join_room', joinPayload(session), { success: false, error: '连接超时，请检查网络' })
        .then((res) => {
          if (res.success && res.room) {
            if (generation !== joinGeneration) return res;
            lastJoinSession = session;
            setRoom(res.room);
            seedPlaybackFromRoom(res.room);
            rememberClientIdentity(res.clientId || res.socketId, res.clientToken);

            if (res.socketId) {
              setConnectionInfo(res.socketId, Boolean(res.isOwner), res.connectionId || null);
            }
            if (res.room.current) {
              prefetchCurrentSong(res.room.current);
            }
          }

          return res;
        });

    },

    [connect, setRoom, setConnectionInfo],

  );



  const leaveRoom = useCallback((): Promise<void> => {
    joinGeneration += 1;
    lastJoinSession = null;
    stopSharedAudio();
    resetPlaybackScheduling();
    resetPlaybackStateCache();
    useAudioStore.getState().setPlaybackVersion(0);
    useAudioStore.getState().setTrackLoading(false);
    useAudioStore.getState().setNeedsAudioUnlock(false);
    useAudioStore.getState().setSmoothPlaybackTime(0);
    resetSession();

    const s = getSocket();
        setDebugSocketProvider(() => ({
      id: s.id,
      connected: s.connected,
      transport: s.io.engine?.transport?.name,
    }));
if (s.connected) {
      s.timeout(SOCKET_ACK_TIMEOUT_MS).emit('leave_room', {}, () => {});
    }
    return Promise.resolve();
  }, [resetSession]);



  const addSong = useCallback((song: Song): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('add_song', { song }, { success: false, error: '连接超时，请重试' });

  }, []);



  const skipSong = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('skip_song', {}, { success: false, error: '连接超时，请重试' });

  }, []);

  const finishSong = useCallback((queueId: string): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('finish_song', { queueId }, { success: false, error: '连接超时，请重试' });
  }, []);



  const togglePlay = useCallback((isPlaying: boolean): Promise<boolean> => {
    return emitWithAck('toggle_play', { isPlaying }, { success: false }).then((res) => res.success);

  }, []);



  const seek = useCallback((time: number): Promise<boolean> => {
    return emitWithAck('seek', { time }, { success: false }).then((res) => res.success);

  }, []);



  const removeSong = useCallback((queueId: string): Promise<boolean> => {
    return emitWithAck('remove_song', { queueId }, { success: false }).then((res) => res.success);

  }, []);



  const requestJump = useCallback((queueId: string): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('request_jump', { queueId }, { success: false, error: '连接超时，请重试' });

  }, []);

  const toggleQueueLike = useCallback((queueId: string): Promise<{ success: boolean; liked?: boolean; error?: string }> => {
    return emitWithAck('toggle_queue_like', { queueId }, { success: false, error: '连接超时，请重试' });

  }, []);



  const approveJump = useCallback((requestId: string): Promise<boolean> => {
    return emitWithAck('approve_jump', { requestId }, { success: false }).then((res) => res.success);

  }, []);



  const rejectJump = useCallback((requestId: string): Promise<boolean> => {
    return emitWithAck('reject_jump', { requestId }, { success: false }).then((res) => res.success);

  }, []);



  const requestSkip = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('request_skip', {}, { success: false, error: '连接超时，请重试' });

  }, []);



  const approveSkip = useCallback((requestId: string): Promise<boolean> => {
    return emitWithAck('approve_skip', { requestId }, { success: false }).then((res) => res.success);

  }, []);



  const rejectSkip = useCallback((requestId: string): Promise<boolean> => {
    return emitWithAck('reject_skip', { requestId }, { success: false }).then((res) => res.success);

  }, []);



  const sendChat = useCallback((
    text: string,
    options: { mentions?: ChatMention[]; replyTo?: ChatReplyRef | null } = {},
  ): Promise<{ success: boolean; error?: string }> => {
    return emitWithAck('send_chat', { text, ...options }, { success: false, error: '连接超时，请重试' });

  }, []);

  const listFavorites = useCallback((): Promise<{ success: boolean; favorites?: FavoriteSong[]; error?: string }> => {
    return emitWithAck('list_favorites', {}, { success: false, error: '连接超时，请重试' });
  }, []);

  const setFavorite = useCallback((song: Song, favorite: boolean): Promise<{ success: boolean; favorites?: FavoriteSong[]; favorite?: boolean; error?: string }> => {
    return emitWithAck('set_favorite', { song, favorite }, { success: false, error: '连接超时，请重试' });
  }, []);

  const importFavorites = useCallback((songs: Song[]): Promise<{ success: boolean; favorites?: FavoriteSong[]; imported?: number; dropped?: number; maxFavorites?: number; error?: string }> => {
    return emitWithAck('import_favorites', { songs }, { success: false, error: '导入超时，请稍后重试' });
  }, []);



  const renameUser = useCallback((nickname: string): Promise<{ success: boolean; error?: string; room?: RoomState }> => {
    return emitWithAck<{ success: boolean; error?: string; room?: RoomState }>(
      'rename_user',
      { nickname },
      { success: false, error: '连接超时，请重试' },
    )
      .then((res) => {
        if (res.success && res.room) {
          setRoom(res.room);
          const nextNickname = nickname.trim();
          useRoomStore.getState().setNickname(nextNickname);
          if (lastJoinSession) {
            lastJoinSession = { ...lastJoinSession, nickname: nextNickname };
          }
        }
        return res;
      });

  }, [setRoom]);

  const transferOwner = useCallback((userId: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    return emitWithAck<{ success: boolean; error?: string; message?: string; room?: RoomState }>(
      'transfer_owner',
      { userId },
      { success: false, error: '连接超时，请重试' },
    ).then((res) => {
      if (res.success && res.room) {
        setRoom(res.room);
        const { mySocketId, myConnectionId } = useRoomStore.getState();
        const nextIsOwner = Boolean(mySocketId && res.room!.ownerId === mySocketId);
        setConnectionInfo(mySocketId, nextIsOwner, myConnectionId);
      }
      return res;
    });
  }, [setRoom, setConnectionInfo]);

  const kickUser = useCallback((userId: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    return emitWithAck<{ success: boolean; error?: string; message?: string; room?: RoomState }>(
      'kick_user',
      { userId },
      { success: false, error: '连接超时，请重试' },
    ).then((res) => {
      if (res.success && res.room) {
        setRoom(res.room);
      }
      return res;
    });
  }, [setRoom]);



  return {

    joinRoom,

    leaveRoom,

    addSong,

    skipSong,
    finishSong,

    togglePlay,

    seek,

    removeSong,

    requestJump,
    toggleQueueLike,

    approveJump,

    rejectJump,

    requestSkip,

    approveSkip,

    rejectSkip,

    sendChat,


    listFavorites,

    setFavorite,
    importFavorites,
    renameUser,

    kickUser,

    transferOwner,

    connect,

  };

}
