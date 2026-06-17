import { useEffect, useRef, useCallback } from 'react';

import { io, Socket } from 'socket.io-client';

import { useRoomStore } from '../stores/roomStore';

import type { ChatMessage, RoomState, Song } from '../types';



let socket: Socket | null = null;



function getSocket(): Socket {

  if (!socket) {

    socket = io({

      transports: ['websocket', 'polling'],

      autoConnect: false,

    });

  }

  return socket;

}



export function useSocket() {

  const setRoom = useRoomStore((s) => s.setRoom);

  const setConnectionInfo = useRoomStore((s) => s.setConnectionInfo);

  const connected = useRef(false);



  useEffect(() => {

    const s = getSocket();



    const onRoomUpdate = (room: RoomState) => {

      setRoom(room);

      const { mySocketId } = useRoomStore.getState();

      if (mySocketId) {

        setConnectionInfo(mySocketId, room.ownerId === mySocketId);

      }

    };



    const onPlaybackTick = (state: { currentTime: number; isPlaying: boolean }) => {

      const current = useRoomStore.getState().room;

      if (!current) return;

      setRoom({ ...current, currentTime: state.currentTime, isPlaying: state.isPlaying });

    };



    const onChatMessage = (message: ChatMessage) => {

      const current = useRoomStore.getState().room;

      if (!current) return;

      if (current.messages.some((m) => m.id === message.id)) return;

      setRoom({ ...current, messages: [...current.messages, message] });

    };



    s.on('room_update', onRoomUpdate);

    s.on('playback_tick', onPlaybackTick);

    s.on('chat_message', onChatMessage);



    return () => {

      s.off('room_update', onRoomUpdate);

      s.off('playback_tick', onPlaybackTick);

      s.off('chat_message', onChatMessage);

    };

  }, [setRoom, setConnectionInfo]);



  const connect = useCallback(() => {

    const s = getSocket();

    if (!connected.current) {

      s.connect();

      connected.current = true;

    }

  }, []);



  const joinRoom = useCallback(

    (roomId: string, nickname: string): Promise<{ success: boolean; error?: string; room?: RoomState }> => {

      return new Promise((resolve) => {

        connect();

        const s = getSocket();

        s.emit(

          'join_room',

          { roomId, nickname },

          (res: {

            success: boolean;

            error?: string;

            room?: RoomState;

            socketId?: string;

            isOwner?: boolean;

          }) => {

            if (res.success && res.room) {

              setRoom(res.room);

              if (res.socketId) {

                setConnectionInfo(res.socketId, Boolean(res.isOwner));

              }

            }

            resolve(res);

          },

        );

      });

    },

    [connect, setRoom, setConnectionInfo],

  );



  const addSong = useCallback((song: Song): Promise<{ success: boolean; error?: string }> => {

    return new Promise((resolve) => {

      getSocket().emit('add_song', { song }, (res: { success: boolean; error?: string }) => {

        resolve(res);

      });

    });

  }, []);



  const skipSong = useCallback((): Promise<{ success: boolean; error?: string }> => {

    return new Promise((resolve) => {

      getSocket().emit('skip_song', {}, (res: { success: boolean; error?: string }) => {

        resolve(res);

      });

    });

  }, []);



  const togglePlay = useCallback((isPlaying: boolean): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('toggle_play', { isPlaying }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const seek = useCallback((time: number): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('seek', { time }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const removeSong = useCallback((queueId: string): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('remove_song', { queueId }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const requestJump = useCallback((queueId: string): Promise<{ success: boolean; error?: string }> => {

    return new Promise((resolve) => {

      getSocket().emit('request_jump', { queueId }, (res: { success: boolean; error?: string }) => {

        resolve(res);

      });

    });

  }, []);



  const approveJump = useCallback((requestId: string): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('approve_jump', { requestId }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const rejectJump = useCallback((requestId: string): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('reject_jump', { requestId }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const requestSkip = useCallback((): Promise<{ success: boolean; error?: string }> => {

    return new Promise((resolve) => {

      getSocket().emit('request_skip', {}, (res: { success: boolean; error?: string }) => {

        resolve(res);

      });

    });

  }, []);



  const approveSkip = useCallback((requestId: string): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('approve_skip', { requestId }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const rejectSkip = useCallback((requestId: string): Promise<boolean> => {

    return new Promise((resolve) => {

      getSocket().emit('reject_skip', { requestId }, (res: { success: boolean }) => {

        resolve(res.success);

      });

    });

  }, []);



  const sendChat = useCallback((text: string): Promise<{ success: boolean; error?: string }> => {

    return new Promise((resolve) => {

      getSocket().emit('send_chat', { text }, (res: { success: boolean; error?: string }) => {

        resolve(res);

      });

    });

  }, []);



  const syncTime = useCallback((time: number) => {

    getSocket().emit('sync_time', { time });

  }, []);



  return {

    joinRoom,

    addSong,

    skipSong,

    togglePlay,

    seek,

    syncTime,

    removeSong,

    requestJump,

    approveJump,

    rejectJump,

    requestSkip,

    approveSkip,

    rejectSkip,

    sendChat,

    connect,

  };

}


