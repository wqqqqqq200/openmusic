import { customAlphabet } from 'nanoid';
import { fetchRandomSong } from './wqwlkjApi.js';

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const rooms = new Map();

function createEmptyRoom(roomId) {
  return {
    id: roomId,
    ownerId: null,
    queue: [],
    current: null,
    isPlaying: false,
    currentTime: 0,
    startedAt: null,
    users: new Map(),
    jumpRequests: [],
    skipRequests: [],
    messages: [],
    createdAt: Date.now(),
  };
}

export function createRoom() {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));

  const room = createEmptyRoom(roomId);
  rooms.set(roomId, room);
  return serializeRoom(room);
}

export function getRoom(roomId) {
  const room = rooms.get(roomId?.toUpperCase());
  return room ? serializeRoom(room) : null;
}

export function roomExists(roomId) {
  return rooms.has(roomId?.toUpperCase());
}

export function addUser(roomId, socketId, nickname) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.users.set(socketId, {
    id: socketId,
    nickname: nickname || `听众${room.users.size + 1}`,
    joinedAt: Date.now(),
  });

  if (!room.ownerId) {
    room.ownerId = socketId;
  }

  return serializeRoom(room);
}

export function removeUser(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.users.delete(socketId);

  if (room.users.size === 0) {
    rooms.delete(roomId);
    return { deleted: true };
  }

  if (room.ownerId === socketId) {
    const nextOwner = Array.from(room.users.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    room.ownerId = nextOwner?.id || null;
  }

  room.jumpRequests = room.jumpRequests.filter((r) => room.users.has(r.requestedBy));
  room.skipRequests = room.skipRequests.filter((r) => room.users.has(r.requestedBy));

  return serializeRoom(room);
}

function songIdentity(source, id) {
  return `${source || 'netease'}:${id}`;
}

function hasDuplicateRequest(room, song, requestedBy) {
  const key = songIdentity(song.source, song.id);
  if (
    room.current
    && room.current.requestedBy === requestedBy
    && songIdentity(room.current.source, room.current.id) === key
  ) {
    return true;
  }
  return room.queue.some(
    (item) => item.requestedBy === requestedBy && songIdentity(item.source, item.id) === key,
  );
}

export async function addToQueue(roomId, song, requestedBy) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  if (hasDuplicateRequest(room, song, requestedBy)) {
    return { error: '你已在歌单中点过这首歌' };
  }

  const item = {
    queueId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...song,
    requestedBy,
    addedAt: Date.now(),
  };

  room.queue.push(item);

  if (!room.current) {
    await playNext(room);
  }

  return { room: serializeRoom(room) };
}

export function removeFromQueue(roomId, socketId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const item = room.queue.find((s) => s.queueId === queueId);
  if (!item) return { error: '歌曲不在队列中' };

  const user = room.users.get(socketId);
  const isRoomOwner = room.ownerId === socketId;
  if (!isRoomOwner && item.requestedBy !== user?.nickname) {
    return { error: '只能删除自己点的歌' };
  }

  room.queue = room.queue.filter((s) => s.queueId !== queueId);
  room.jumpRequests = room.jumpRequests.filter((r) => r.queueId !== queueId);
  return { room: serializeRoom(room) };
}

async function playNext(room) {
  room.skipRequests = [];

  if (room.queue.length === 0) {
    const random = await fetchRandomSong();
    if (random) {
      room.current = {
        queueId: `random-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...random,
        requestedBy: '随机推荐',
        addedAt: Date.now(),
      };
      room.isPlaying = true;
      room.currentTime = 0;
      room.startedAt = Date.now();
      return;
    }

    room.current = null;
    room.isPlaying = false;
    room.currentTime = 0;
    room.startedAt = null;
    return;
  }

  room.current = room.queue.shift();
  room.isPlaying = true;
  room.currentTime = 0;
  room.startedAt = Date.now();
}

export async function ensurePlayback(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.current) return serializeRoom(room);

  await playNext(room);
  return serializeRoom(room);
}

export async function skipSong(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.ownerId !== socketId) return { error: '仅房主可切歌' };

  await playNext(room);
  return { room: serializeRoom(room) };
}

export function setPlaying(roomId, isPlaying) {
  const room = rooms.get(roomId);
  if (!room || !room.current) return null;

  room.isPlaying = isPlaying;
  if (isPlaying) {
    room.startedAt = Date.now() - room.currentTime * 1000;
  } else {
    room.currentTime = room.startedAt
      ? (Date.now() - room.startedAt) / 1000
      : room.currentTime;
    room.startedAt = null;
  }

  return serializeRoom(room);
}

export function seekTo(roomId, socketId, time) {
  const room = rooms.get(roomId);
  if (!room || !room.current) return null;
  if (room.ownerId !== socketId) return null;

  room.currentTime = Math.max(0, time);
  room.startedAt = room.isPlaying ? Date.now() - room.currentTime * 1000 : null;
  return serializeRoom(room);
}

export function requestJump(roomId, socketId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const user = room.users.get(socketId);
  const item = room.queue.find((s) => s.queueId === queueId);
  if (!item) return { error: '歌曲不在队列中' };
  if (item.requestedBy !== user?.nickname) return { error: '只能为自己点的歌申请插队' };
  if (room.jumpRequests.some((r) => r.queueId === queueId)) return { error: '已提交过插队申请' };

  room.jumpRequests.push({
    id: generateId(),
    queueId,
    songName: item.name,
    nickname: user.nickname,
    requestedBy: socketId,
    requestedAt: Date.now(),
  });

  return { room: serializeRoom(room) };
}

export async function approveJump(roomId, socketId, requestId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.ownerId !== socketId) return { error: '仅房主可审批' };

  const reqIdx = room.jumpRequests.findIndex((r) => r.id === requestId);
  if (reqIdx === -1) return { error: '申请不存在' };

  const req = room.jumpRequests[reqIdx];
  room.jumpRequests.splice(reqIdx, 1);

  const qIdx = room.queue.findIndex((s) => s.queueId === req.queueId);
  if (qIdx !== -1) {
    const [song] = room.queue.splice(qIdx, 1);
    room.queue.unshift(song);
    await playNext(room);
  }

  return { room: serializeRoom(room) };
}

export function rejectJump(roomId, socketId, requestId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.ownerId !== socketId) return { error: '仅房主可审批' };

  const before = room.jumpRequests.length;
  room.jumpRequests = room.jumpRequests.filter((r) => r.id !== requestId);
  if (room.jumpRequests.length === before) return { error: '申请不存在' };

  return { room: serializeRoom(room) };
}

export function requestSkip(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!room.current) return { error: '当前没有正在播放的歌曲' };
  if (room.ownerId === socketId) return { error: '房主可直接切歌' };

  const user = room.users.get(socketId);
  if (room.skipRequests.some((r) => r.requestedBy === socketId)) {
    return { error: '已提交过切歌申请' };
  }

  room.skipRequests.push({
    id: generateId(),
    songName: room.current.name,
    nickname: user?.nickname || '匿名',
    requestedBy: socketId,
    requestedAt: Date.now(),
  });

  return { room: serializeRoom(room) };
}

export async function approveSkip(roomId, socketId, requestId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.ownerId !== socketId) return { error: '仅房主可审批' };

  const reqIdx = room.skipRequests.findIndex((r) => r.id === requestId);
  if (reqIdx === -1) return { error: '申请不存在' };

  room.skipRequests.splice(reqIdx, 1);
  await playNext(room);

  return { room: serializeRoom(room) };
}

export function rejectSkip(roomId, socketId, requestId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.ownerId !== socketId) return { error: '仅房主可审批' };

  const before = room.skipRequests.length;
  room.skipRequests = room.skipRequests.filter((r) => r.id !== requestId);
  if (room.skipRequests.length === before) return { error: '申请不存在' };

  return { room: serializeRoom(room) };
}

export function addChatMessage(roomId, socketId, text) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const content = String(text || '').trim();
  if (!content) return { error: '消息不能为空' };
  if (content.length > 500) return { error: '消息过长' };

  const user = room.users.get(socketId);
  const message = {
    id: generateId(),
    userId: socketId,
    nickname: user?.nickname || '匿名',
    text: content,
    timestamp: Date.now(),
  };

  room.messages.push(message);
  if (room.messages.length > 100) {
    room.messages.splice(0, room.messages.length - 100);
  }

  return { message, room: serializeRoom(room) };
}

export function getPlaybackTime(room) {
  if (!room.current) return 0;
  if (room.isPlaying && room.startedAt) {
    return (Date.now() - room.startedAt) / 1000;
  }
  return room.currentTime;
}

function serializeRoom(room) {
  return {
    id: room.id,
    ownerId: room.ownerId,
    queue: room.queue,
    current: room.current,
    isPlaying: room.isPlaying,
    currentTime: getPlaybackTime(room),
    users: Array.from(room.users.values()),
    userCount: room.users.size,
    jumpRequests: room.jumpRequests,
    skipRequests: room.skipRequests,
    messages: room.messages,
  };
}

export function getRoomInternal(roomId) {
  return rooms.get(roomId);
}

export function isOwner(room, socketId) {
  return room?.ownerId === socketId;
}
