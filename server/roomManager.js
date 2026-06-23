import { customAlphabet } from 'nanoid';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { fetchRandomSong } from './cyapi.js';
import {
  initRoomStorage,
  isRedisEnabled,
  loadAllRoomsFromStorage,
  queueSaveRoomToStorage,
  deleteRoomFromStorage,
} from './roomStorage.js';

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000;
const MAX_QUEUE_LENGTH = 200;
const MAX_SONG_HISTORY = 150;
const MAX_RANDOM_HISTORY = 200;
const MAX_RANDOM_PREFETCH_ATTEMPTS = 20;
const AUTO_ADVANCE_GRACE_SEC = 0.15;
const LRC_TAIL_PADDING_SEC = 20;

const rooms = new Map();

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return true;
  if (!password) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, 32);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function verifyRoomPassword(roomId, password) {
  const room = rooms.get(roomId?.toUpperCase());
  if (!room) return { ok: false, error: '房间不存在' };
  if (!verifyPassword(password, room.passwordHash)) {
    return { ok: false, error: '密码错误', needsPassword: true };
  }
  return { ok: true };
}

function cancelRoomDestroy(room) {
  if (room.destroyTimer) {
    clearTimeout(room.destroyTimer);
    room.destroyTimer = null;
  }
}

function scheduleRoomDestroy(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  cancelRoomDestroy(room);
  room.destroyTimer = setTimeout(() => {
    const current = rooms.get(roomId);
    if (current && current.users.size === 0) {
      rooms.delete(roomId);
      invalidateRoomsListCache();
      void deleteRoomFromStorage(roomId);
    }
  }, ROOM_EMPTY_TTL_MS);
}

function snapshotRoomForStorage(room) {
  return {
    id: room.id,
    name: room.name,
    passwordHash: room.passwordHash,
    creatorId: room.creatorId ?? null,
    bannedUserIds: Array.from(room.bannedUserIds || []),
    queue: room.queue,
    current: room.current,
    isPlaying: room.isPlaying,
    currentTime: getPlaybackTime(room),
    playbackVersion: room.playbackVersion ?? 0,
    playbackUpdatedAt: room.playbackUpdatedAt ?? Date.now(),
    messages: room.messages.slice(-100),
    songHistory: (room.songHistory || []).slice(-MAX_SONG_HISTORY),
    jumpRequests: room.jumpRequests,
    skipRequests: room.skipRequests,
    randomPlayedKeys: Array.from(room.randomPlayedKeys),
    nextRandom: room.nextRandom,
    createdAt: room.createdAt,
  };
}

function restoreRoomFromStorage(data) {
  const room = createEmptyRoom(data.id, data.name, data.passwordHash ?? null);
  room.queue = data.queue || [];
  room.current = data.current ?? null;
  room.isPlaying = Boolean(data.isPlaying);
  room.currentTime = data.currentTime ?? 0;
  room.playbackVersion = data.playbackVersion ?? 0;
  room.playbackUpdatedAt = data.playbackUpdatedAt ?? Date.now();
  room.messages = data.messages || [];
  room.songHistory = Array.isArray(data.songHistory) ? data.songHistory.slice(-MAX_SONG_HISTORY) : [];
  room.jumpRequests = data.jumpRequests || [];
  room.skipRequests = data.skipRequests || [];
  room.randomPlayedKeys = new Set(data.randomPlayedKeys || []);
  room.nextRandom = data.nextRandom ?? null;
  room.creatorId = data.creatorId ?? null;
  room.bannedUserIds = new Set(data.bannedUserIds || []);
  room.createdAt = data.createdAt ?? Date.now();

  if (room.isPlaying && room.current) {
    room.startedAt = Date.now() - room.currentTime * 1000;
  }

  return room;
}

const pendingPersistRooms = new Map();
let persistFlushScheduled = false;

function flushPendingPersists() {
  persistFlushScheduled = false;
  const batch = new Map(pendingPersistRooms);
  pendingPersistRooms.clear();

  for (const room of batch.values()) {
    queueSaveRoomToStorage(snapshotRoomForStorage(room));
  }
}

function persistRoom(room) {
  if (!room) return;
  pendingPersistRooms.set(room.id, room);
  if (!persistFlushScheduled) {
    persistFlushScheduled = true;
    setImmediate(flushPendingPersists);
  }
}

let cachedListRooms = null;
let cachedListRoomsAt = 0;
const LIST_ROOMS_CACHE_MS = 1500;

function invalidateRoomsListCache() {
  cachedListRooms = null;
  cachedListRoomsAt = 0;
}

function isRoomVisibleInLobby(room) {
  if (room.users.size > 0) return true;
  if (room.current || room.isPlaying) return true;
  if (room.queue.length > 0) return true;
  return false;
}

export async function initRooms() {
  await initRoomStorage();
  const stored = await loadAllRoomsFromStorage();

  for (const data of stored) {
    const room = restoreRoomFromStorage(data);
    rooms.set(room.id, room);
    if (room.users.size === 0) {
      scheduleRoomDestroy(room.id);
    }
  }

  if (stored.length > 0) {
    console.log(`已从 Redis 恢复 ${stored.length} 个房间`);
  }

  if (isRedisEnabled()) {
    setInterval(() => {
      for (const room of rooms.values()) {
        if (room.isPlaying || room.users.size > 0 || room.queue.length > 0) {
          persistRoom(room);
        }
      }
    }, 30000);
  }
}

export { isRedisEnabled };

function normalizeRoomName(name, roomId) {
  const trimmed = String(name || '').trim();
  return trimmed.slice(0, 30) || `房间 ${roomId}`;
}

function bumpPlaybackState(room) {
  room.playbackVersion = (room.playbackVersion || 0) + 1;
  room.playbackUpdatedAt = Date.now();
}

export function buildPlaybackState(room) {
  if (!room) return null;
  repairPlaybackClock(room);
  const now = Date.now();
  const positionSec = getPlaybackTime(room);
  return {
    roomId: room.id,
    version: room.playbackVersion || 0,
    trackId: room.current?.queueId || '',
    status: room.isPlaying ? 'playing' : 'paused',
    positionSec,
    serverNowMs: now,
    startedAt: room.isPlaying && room.startedAt ? room.startedAt : 0,
    currentTime: positionSec,
    updatedAt: room.playbackUpdatedAt || now,
  };
}

function createEmptyRoom(roomId, name, passwordHash = null) {
  return {
    id: roomId,
    name: normalizeRoomName(name, roomId),
    passwordHash,
    creatorId: null,
    ownerId: null,
    bannedUserIds: new Set(),
    queue: [],
    current: null,
    isPlaying: false,
    currentTime: 0,
    startedAt: null,
    playbackVersion: 0,
    playbackUpdatedAt: Date.now(),
    users: new Map(),
    ownerConnectionId: null,
    jumpRequests: [],
    skipRequests: [],
    messages: [],
    songHistory: [],
    randomPlayedKeys: new Set(),
    nextRandom: null,
    nextRandomPromise: null,
    randomLoading: false,
    playbackLock: null,
    autoAdvancePromise: null,
    createdAt: Date.now(),
    destroyTimer: null,
  };
}

function getNextOwnerId(room) {
  return Array.from(room.users.values())
    .filter((user) => !user.readOnly)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id || null;
}

function isEligibleOwner(user) {
  return Boolean(user && !user.readOnly);
}

function sanitizeCreatorId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : '';
}

/** 记录房间创建者（首个可操控的非只读用户，或由创建房间 API 指定，持久保留） */
function ensureCreatorId(room, userId) {
  if (room.creatorId) return;
  const user = room.users.get(userId);
  if (isEligibleOwner(user)) {
    room.creatorId = userId;
  }
}

/**
 * 刷新房主：现任房主有效则保留；无效时优先创建者，否则最早加入者。
 * preferCreator：创建者重新加入时强制恢复房主。
 */
function refreshRoomOwner(room, options = {}) {
  const { preferCreator = false } = options;

  if (preferCreator) {
    const creator = room.creatorId ? room.users.get(room.creatorId) : null;
    if (isEligibleOwner(creator)) {
      room.ownerId = room.creatorId;
      refreshOwnerConnection(room);
      return;
    }
  }

  const owner = room.ownerId ? room.users.get(room.ownerId) : null;
  if (isEligibleOwner(owner)) {
    refreshOwnerConnection(room);
    return;
  }

  const creator = room.creatorId ? room.users.get(room.creatorId) : null;
  if (isEligibleOwner(creator)) {
    room.ownerId = room.creatorId;
  } else {
    room.ownerId = getNextOwnerId(room);
  }
  refreshOwnerConnection(room);
}

function getDefaultNickname(room) {
  const used = new Set(Array.from(room.users.values()).map((user) => user.nickname));
  for (let i = 1; i <= room.users.size + 100; i++) {
    const nickname = `听众${i}`;
    if (!used.has(nickname)) return nickname;
  }
  return `听众${Date.now().toString(36).slice(-4)}`;
}

function getOwnerConnectionId(room) {
  const owner = room.ownerId ? room.users.get(room.ownerId) : null;
  return owner?.connectionIds?.values().next().value || owner?.connectionId || null;
}

function refreshOwnerConnection(room) {
  room.ownerConnectionId = getOwnerConnectionId(room);
}

function normalizeConnectionIds(existing, connectionId) {
  const ids = new Set(existing?.connectionIds || []);
  if (existing?.connectionId) ids.add(existing.connectionId);
  if (connectionId) ids.add(connectionId);
  return ids;
}

function freezePlayback(room) {
  if (!room?.current || !room.isPlaying) return;
  room.currentTime = getPlaybackTime(room);
  room.isPlaying = false;
  room.startedAt = null;
  bumpPlaybackState(room);
}

function getSongDurationSeconds(song) {
  const durationMs = Number(song?.duration || 0);
  if (Number.isFinite(durationMs) && durationMs > 0) return durationMs / 1000;

  let lastTime = 0;
  const regex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of String(song?.lrc || '').split('\n')) {
    let match;
    while ((match = regex.exec(line))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0;
      const time = minutes * 60 + seconds + fraction;
      if (Number.isFinite(time) && time > lastTime) lastTime = time;
    }
  }

  return lastTime > 0 ? lastTime + LRC_TAIL_PADDING_SEC : 0;
}

export function createRoom({ name, password, creatorId } = {}) {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));

  const trimmed = String(password || '').trim();
  const passwordHash = trimmed ? hashPassword(trimmed) : null;
  const room = createEmptyRoom(roomId, name, passwordHash);
  const reservedCreator = sanitizeCreatorId(creatorId);
  if (reservedCreator) {
    room.creatorId = reservedCreator;
  }
  rooms.set(roomId, room);
  persistRoom(room);
  invalidateRoomsListCache();
  return serializeRoom(room);
}

export function listRooms() {
  const now = Date.now();
  if (cachedListRooms && now - cachedListRoomsAt < LIST_ROOMS_CACHE_MS) {
    return cachedListRooms;
  }

  cachedListRooms = Array.from(rooms.values())
    .filter(isRoomVisibleInLobby)
    .map(serializeRoomSummary)
    .sort((a, b) => b.userCount - a.userCount || b.createdAt - a.createdAt);
  cachedListRoomsAt = now;
  return cachedListRooms;
}

export function listRoomIds() {
  return Array.from(rooms.keys());
}

export function getRoomPublic(roomId) {
  const room = rooms.get(roomId?.toUpperCase());
  if (!room) return null;
  return {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    userCount: room.users.size,
    isPlaying: room.isPlaying,
    currentSong: room.current
      ? { name: room.current.name, artist: room.current.artist }
      : null,
    queueLength: room.queue.length,
    createdAt: room.createdAt,
  };
}

export function getRoom(roomId) {
  const room = rooms.get(roomId?.toUpperCase());
  return room ? serializeRoom(room) : null;
}

export function roomExists(roomId) {
  return rooms.has(roomId?.toUpperCase());
}

export function isUserBanned(roomId, userId) {
  const room = rooms.get(roomId?.toUpperCase());
  if (!room || !userId) return false;
  return room.bannedUserIds?.has(userId) ?? false;
}

export function addUser(roomId, userId, nickname, options = {}) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.bannedUserIds?.has(userId)) {
    return { error: '你已被移出该房间，无法再次进入' };
  }

  cancelRoomDestroy(room);

  const existing = room.users.get(userId);
  const connectionIds = normalizeConnectionIds(existing, options.connectionId || null);
  room.users.set(userId, {
    id: userId,
    nickname: normalizeNickname(nickname) || existing?.nickname || getDefaultNickname(room),
    readOnly: Boolean(options.readOnly),
    joinedAt: existing?.joinedAt || Date.now(),
    connectionId: options.connectionId || null,
    connectionIds,
    location: String(options.location || existing?.location || '').trim().slice(0, 12),
  });

  reassignOrphanQueueOwnership(
    room,
    userId,
    normalizeNickname(nickname) || existing?.nickname || getDefaultNickname(room),
  );

  ensureCreatorId(room, userId);
  refreshRoomOwner(room, { preferCreator: room.creatorId === userId });
  if (room.creatorId === userId) {
    refreshOwnerConnection(room);
  }
  if (room.isPlaying && room.current && !room.startedAt) {
    room.startedAt = Date.now() - (room.currentTime || 0) * 1000;
  }

  persistRoom(room);
  invalidateRoomsListCache();
  return serializeRoom(room);
}

function normalizeNickname(nickname) {
  return String(nickname || '').trim().slice(0, 20);
}

function updateRequesterNickname(item, socketId, nickname) {
  if (item?.requestedById === socketId) {
    item.requestedBy = nickname;
  }
}

function reassignOrphanQueueOwnership(room, userId, nickname) {
  const normalizedNick = normalizeNickname(nickname);
  if (!normalizedNick) return;

  const activeUserIds = new Set(room.users.keys());
  const reassignIfOrphan = (item) => {
    if (!item || item.requestedBy !== normalizedNick) return;
    if (item.requestedById === userId) return;
    if (item.requestedById && activeUserIds.has(item.requestedById)) return;
    item.requestedById = userId;
  };

  reassignIfOrphan(room.current);
  room.queue.forEach(reassignIfOrphan);
}

function isQueueRequester(item, socketId, user) {
  if (!item) return false;
  return item.requestedById === socketId || item.requestedBy === user?.nickname;
}

export function renameUser(roomId, socketId, nickname) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const user = room.users.get(socketId);
  if (!user) return { error: '未加入房间' };

  const nextNickname = normalizeNickname(nickname);
  if (!nextNickname) return { error: '昵称不能为空' };

  user.nickname = nextNickname;
  updateRequesterNickname(room.current, socketId, nextNickname);
  room.queue.forEach((item) => updateRequesterNickname(item, socketId, nextNickname));
  room.jumpRequests.forEach((request) => {
    if (request.requestedBy === socketId) request.nickname = nextNickname;
  });
  room.skipRequests.forEach((request) => {
    if (request.requestedBy === socketId) request.nickname = nextNickname;
  });
  room.messages.forEach((message) => {
    if (message.userId === socketId) {
      message.userId = socketId;
      message.nickname = nextNickname;
    }
  });

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export function kickUser(roomId, actorId, targetUserId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, actorId, connectionId)) return { error: '仅房主可踢人' };
  if (targetUserId === actorId) return { error: '不能踢出自己' };
  if (targetUserId === room.creatorId) return { error: '不能踢出房间创建者' };

  const target = room.users.get(targetUserId);
  if (!target) return { error: '用户不在房间中' };

  if (!room.bannedUserIds) room.bannedUserIds = new Set();
  room.bannedUserIds.add(targetUserId);

  room.users.delete(targetUserId);

  if (room.users.size === 0) {
    if (room.isPlaying && room.current) {
      room.currentTime = getPlaybackTime(room);
      room.startedAt = null;
      bumpPlaybackState(room);
    } else {
      freezePlayback(room);
    }
    room.ownerId = null;
    room.ownerConnectionId = null;
    persistRoom(room);
    scheduleRoomDestroy(roomId);
    invalidateRoomsListCache();
    return {
      room: serializeRoom(room),
      kickedUserId: targetUserId,
      kickedNickname: target.nickname,
    };
  }

  refreshRoomOwner(room);
  if (!room.ownerId) {
    freezePlayback(room);
  }

  room.jumpRequests = room.jumpRequests.filter((r) => room.users.has(r.requestedBy));
  room.skipRequests = room.skipRequests.filter((r) => room.users.has(r.requestedBy));

  persistRoom(room);
  invalidateRoomsListCache();
  return {
    room: serializeRoom(room),
    kickedUserId: targetUserId,
    kickedNickname: target.nickname,
  };
}

export function transferOwner(roomId, actorId, targetUserId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, actorId, connectionId)) return { error: '仅房主可转让' };
  if (targetUserId === actorId) return { error: '不能转让给自己' };

  const target = room.users.get(targetUserId);
  if (!target) return { error: '用户不在房间中' };
  if (!isEligibleOwner(target)) return { error: '不能转让给 TV 只读用户' };

  room.ownerId = targetUserId;
  refreshOwnerConnection(room);
  persistRoom(room);
  invalidateRoomsListCache();
  return {
    room: serializeRoom(room),
    message: `房主已转让给「${target.nickname}」`,
  };
}

export function removeUser(roomId, userId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const user = room.users.get(userId);
  if (connectionId && user?.connectionIds?.size && !user.connectionIds.has(connectionId)) {
    return serializeRoom(room);
  }

  if (connectionId && user?.connectionIds) {
    user.connectionIds.delete(connectionId);
    if (user.connectionIds.size > 0) {
      if (user.connectionId === connectionId) {
        user.connectionId = user.connectionIds.values().next().value || null;
      }
      refreshOwnerConnection(room);
      persistRoom(room);
      invalidateRoomsListCache();
      return serializeRoom(room);
    }
  }

  room.users.delete(userId);

  if (room.users.size === 0) {
    // 刷新/断线时房间会短暂无人：保留 isPlaying，仅冻结进度，便于重新进入后继续播放
    if (room.isPlaying && room.current) {
      room.currentTime = getPlaybackTime(room);
      room.startedAt = null;
      bumpPlaybackState(room);
    } else {
      freezePlayback(room);
    }
    room.ownerId = null;
    room.ownerConnectionId = null;
    persistRoom(room);
    scheduleRoomDestroy(roomId);
    invalidateRoomsListCache();
    return { empty: true };
  }

  refreshRoomOwner(room);
  if (!room.ownerId) {
    freezePlayback(room);
  }

  room.jumpRequests = room.jumpRequests.filter((r) => room.users.has(r.requestedBy));
  room.skipRequests = room.skipRequests.filter((r) => room.users.has(r.requestedBy));

  persistRoom(room);
  invalidateRoomsListCache();
  return serializeRoom(room);
}


export function updateUserLocation(roomId, userId, location) {
  const room = rooms.get(roomId);
  const user = room?.users.get(userId);
  if (!room || !user) return null;

  const nextLocation = String(location || '').trim().slice(0, 12);
  if (user.location === nextLocation) return serializeRoom(room);

  user.location = nextLocation;
  persistRoom(room);
  return serializeRoom(room);
}

export function canUserMutate(roomId, userId) {
  const room = rooms.get(roomId);
  const user = room?.users.get(userId);
  return Boolean(room && user && !user.readOnly);
}

function isOwnerConnection(room, userId, connectionId = null) {
  return Boolean(room && room.ownerId === userId);
}

function songIdentity(source, id) {
  return `${source || 'netease'}:${id}`;
}

function isSongInPlaylist(room, song) {
  const key = songIdentity(song.source, song.id);
  if (room.current && songIdentity(room.current.source, room.current.id) === key) {
    return true;
  }
  return room.queue.some((item) => songIdentity(item.source, item.id) === key);
}

function getQueueLikes(item) {
  return Array.isArray(item?.likedByIds) ? item.likedByIds.length : 0;
}

function sortQueueByPriority(room) {
  room.queue.sort((a, b) => {
    const priorityDiff = (b.ownerPriority || 0) - (a.ownerPriority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    const likeDiff = getQueueLikes(b) - getQueueLikes(a);
    if (likeDiff !== 0) return likeDiff;
    return (a.addedAt || 0) - (b.addedAt || 0);
  });
}

export async function addToQueue(roomId, song, requestedByUser) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const requestedBy = {
    id: requestedByUser?.id || '',
    nickname: requestedByUser?.nickname || '匿名',
  };

  if (isSongInPlaylist(room, song)) {
    return { error: '这首歌已经在歌单里啦' };
  }

  if (room.queue.length >= MAX_QUEUE_LENGTH) {
    return { error: `队列最多保留 ${MAX_QUEUE_LENGTH} 首歌` };
  }

  const item = {
    queueId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...song,
    requestedBy: requestedBy.nickname,
    requestedById: requestedBy.id,
    addedAt: Date.now(),
    likedByIds: [],
    ownerPriority: 0,
  };

  room.queue.push(item);
  room.songHistory = [
    {
      id: item.id,
      source: item.source,
      name: item.name,
      artist: item.artist,
      album: item.album,
      pic: item.pic,
      duration: item.duration,
      url: item.url,
      lrc: item.lrc,
      requestedBy: requestedBy.nickname,
      requestedById: requestedBy.id,
      requestedAt: item.addedAt,
    },
    ...(room.songHistory || []),
  ].slice(0, MAX_SONG_HISTORY);

  if (!room.current) {
    await withPlaybackLock(room, async () => {
      if (!room.current) await playNextUnlocked(room, { allowFetchRandom: true });
    });
  }

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export function toggleQueueLike(roomId, userId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  const user = room.users.get(userId);
  if (!user) return { error: '未加入房间' };

  const item = room.queue.find((s) => s.queueId === queueId);
  if (!item) return { error: '只能点赞待播放歌曲' };

  const likedByIds = Array.isArray(item.likedByIds) ? item.likedByIds : [];
  const nextLiked = !likedByIds.includes(userId);
  item.likedByIds = nextLiked ? [...likedByIds, userId] : likedByIds.filter((id) => id !== userId);
  sortQueueByPriority(room);
  persistRoom(room);
  return { room: serializeRoom(room), liked: nextLiked };
}

export function removeFromQueue(roomId, socketId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const item = room.queue.find((s) => s.queueId === queueId);
  if (!item) return { error: '歌曲不在队列中' };

  const user = room.users.get(socketId);
  const isRoomOwner = room.ownerId === socketId;
  const isRequester = isQueueRequester(item, socketId, user);
  if (!isRoomOwner && !isRequester) {
    return { error: '只能删除自己点的歌' };
  }

  room.queue = room.queue.filter((s) => s.queueId !== queueId);
  room.jumpRequests = room.jumpRequests.filter((r) => r.queueId !== queueId);
  persistRoom(room);
  return { room: serializeRoom(room) };
}

function trimRandomHistory(room) {
  if (room.randomPlayedKeys.size <= MAX_RANDOM_HISTORY) return;
  const excess = room.randomPlayedKeys.size - MAX_RANDOM_HISTORY;
  const iter = room.randomPlayedKeys.values();
  for (let i = 0; i < excess; i++) {
    const key = iter.next().value;
    if (key) room.randomPlayedKeys.delete(key);
  }
}

function recordRandomPlayed(room, song) {
  room.randomPlayedKeys.add(songIdentity(song.source, song.id));
  trimRandomHistory(room);
}

function getRandomExcludeKeys(room) {
  const exclude = new Set(room.randomPlayedKeys);
  if (room.current?.requestedBy === '随机推荐') {
    exclude.add(songIdentity(room.current.source, room.current.id));
  }
  if (room.nextRandom) {
    exclude.add(songIdentity(room.nextRandom.source, room.nextRandom.id));
  }
  return exclude;
}

function clearNextRandom(room) {
  room.nextRandom = null;
  room.nextRandomPromise = null;
}

async function ensureNextRandom(room) {
  if (room.queue.length > 0) {
    clearNextRandom(room);
    return;
  }
  if (room.nextRandom || room.nextRandomPromise) return;

  room.nextRandomPromise = (async () => {
    try {
      for (let i = 0; i < MAX_RANDOM_PREFETCH_ATTEMPTS && room.queue.length === 0; i++) {
        const song = await fetchRandomSong(() => getRandomExcludeKeys(room));
        if (!song) break;

        const key = songIdentity(song.source, song.id);
        if (room.randomPlayedKeys.has(key)) continue;

        room.nextRandom = song;
        break;
      }
    } finally {
      room.nextRandomPromise = null;
    }
  })();

  await room.nextRandomPromise;
}

async function withPlaybackLock(room, task) {
  const previous = room.playbackLock || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  room.playbackLock = current;
  try {
    return await current;
  } finally {
    if (room.playbackLock === current) {
      room.playbackLock = null;
    }
  }
}

function setCurrentSong(room, song) {
  room.randomLoading = false;
  room.current = song;
  room.isPlaying = true;
  room.currentTime = 0;
  room.startedAt = Date.now();
  bumpPlaybackState(room);
  if (room.queue.length === 0) void ensureNextRandom(room);
}

async function playNextUnlocked(room, options = {}) {
  const { allowFetchRandom = false } = options;
  room.skipRequests = [];

  if (room.queue.length > 0) {
    clearNextRandom(room);
    setCurrentSong(room, room.queue.shift());
    return;
  }

  let random = room.nextRandom;
  room.nextRandom = null;

  if (random && room.randomPlayedKeys.has(songIdentity(random.source, random.id))) {
    random = null;
  }

  if (!random && allowFetchRandom) {
    random = await fetchRandomSong(() => getRandomExcludeKeys(room));
  }

  if (room.queue.length > 0) {
    if (random && !room.nextRandom) room.nextRandom = random;
    setCurrentSong(room, room.queue.shift());
    return;
  }

  if (random) {
    recordRandomPlayed(room, random);
    setCurrentSong(room, {
      queueId: `random-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...random,
      requestedBy: '随机推荐',
      addedAt: Date.now(),
    });
    void ensureNextRandom(room);
    return;
  }

  clearNextRandom(room);
  room.current = null;
  room.isPlaying = false;
  room.currentTime = 0;
  room.startedAt = null;
  room.randomLoading = true;
  bumpPlaybackState(room);
}

async function playNext(room, options = {}) {
  return withPlaybackLock(room, () => playNextUnlocked(room, options));
}

export async function ensurePlayback(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.current) {
    room.randomLoading = false;
    return serializeRoom(room);
  }

  room.randomLoading = true;
  try {
    await withPlaybackLock(room, async () => {
      if (!room.current) await playNextUnlocked(room, { allowFetchRandom: true });
    });
  } finally {
    room.randomLoading = false;
  }
  persistRoom(room);
  return serializeRoom(room);
}

/** 标记房间正在拉取随机歌曲（用于加入后立即向客户端反馈"加载中"） */
export function markRandomLoading(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.current && room.queue.length === 0) {
    room.randomLoading = true;
  }
  return serializeRoom(room);
}

export async function skipSong(roomId, socketId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可切歌' };

  await playNext(room, { allowFetchRandom: false });
  persistRoom(room);
  return { room: serializeRoom(room) };
}

export async function finishCurrentSong(roomId, socketId, connectionId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可结束歌曲' };
  if (!room.current) return { error: '当前没有正在播放的歌曲' };
  if (queueId && room.current.queueId !== queueId) return { room: serializeRoom(room) };

  await withPlaybackLock(room, async () => {
    if (!room.current) return;
    if (queueId && room.current.queueId !== queueId) return;
    await playNextUnlocked(room, { allowFetchRandom: false });
  });
  persistRoom(room);
  return { room: serializeRoom(room) };
}

export async function advancePlaybackIfEnded(roomId, options = {}) {
  const room = rooms.get(roomId);
  if (!room?.current || !room.isPlaying) return null;

  const { force = false, expectedQueueId = '' } = options;
  if (expectedQueueId && room.current.queueId !== expectedQueueId) return null;

  const durationSec = getSongDurationSeconds(room.current);
  if (durationSec <= 0 && !force) return null;
  if (!force && getPlaybackTime(room) < durationSec + AUTO_ADVANCE_GRACE_SEC) return null;

  if (room.autoAdvancePromise) return null;

  room.autoAdvancePromise = withPlaybackLock(room, async () => {
    if (!room.current || !room.isPlaying) return null;
    if (expectedQueueId && room.current.queueId !== expectedQueueId) return null;

    const lockedDurationSec = getSongDurationSeconds(room.current);
    if (!force && (lockedDurationSec <= 0 || getPlaybackTime(room) < lockedDurationSec + AUTO_ADVANCE_GRACE_SEC)) {
      return null;
    }
    await playNextUnlocked(room, { allowFetchRandom: false });
    persistRoom(room);
    return serializeRoom(room);
  });

  try {
    return await room.autoAdvancePromise;
  } finally {
    room.autoAdvancePromise = null;
  }
}

export function setPlaying(roomId, socketId, isPlaying, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room || !room.current) return null;
  if (!isOwnerConnection(room, socketId, connectionId)) return null;

  room.isPlaying = isPlaying;
  if (isPlaying) {
    room.startedAt = Date.now() - room.currentTime * 1000;
  } else {
    room.currentTime = room.startedAt
      ? (Date.now() - room.startedAt) / 1000
      : room.currentTime;
    room.startedAt = null;
  }
  bumpPlaybackState(room);

  persistRoom(room);
  return serializeRoom(room);
}

export function seekTo(roomId, socketId, time, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room || !room.current) return null;
  if (!isOwnerConnection(room, socketId, connectionId)) return null;

  const nextTime = Number(time);
  if (!Number.isFinite(nextTime) || nextTime < 0) return null;

  room.currentTime = nextTime;
  room.startedAt = room.isPlaying ? Date.now() - room.currentTime * 1000 : null;
  bumpPlaybackState(room);
  persistRoom(room);
  return serializeRoom(room);
}

async function applyJumpToFront(room, queueId, options = {}) {
  const { ownerPriority = false } = options;
  const qIdx = room.queue.findIndex((s) => s.queueId === queueId);
  if (qIdx === -1) return false;

  const [song] = room.queue.splice(qIdx, 1);
  if (ownerPriority) song.ownerPriority = Date.now();
  room.queue.unshift(song);
  if (!room.current) {
    await withPlaybackLock(room, async () => {
      if (!room.current) await playNextUnlocked(room, { allowFetchRandom: true });
    });
  }
  return true;
}

export async function requestJump(roomId, socketId, queueId) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const user = room.users.get(socketId);
  if (!user) return { error: '未加入房间' };

  const item = room.queue.find((s) => s.queueId === queueId);
  if (!item) return { error: '歌曲不在队列中' };
  const isOwner = isOwnerConnection(room, socketId);
  const isRequester = isQueueRequester(item, socketId, user);
  if (!isOwner && !isRequester) return { error: '只能为自己点的歌插队' };

  const jumped = await applyJumpToFront(room, queueId, { ownerPriority: isOwner });
  if (!jumped) return { error: '歌曲不在队列中' };

  room.jumpRequests = room.jumpRequests.filter((r) => r.queueId !== queueId);
  persistRoom(room);
  return { room: serializeRoom(room) };
}

export async function approveJump(roomId, socketId, requestId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可审批' };

  const reqIdx = room.jumpRequests.findIndex((r) => r.id === requestId);
  if (reqIdx === -1) return { error: '申请不存在' };

  const req = room.jumpRequests[reqIdx];
  room.jumpRequests.splice(reqIdx, 1);

  await applyJumpToFront(room, req.queueId, { ownerPriority: true });

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export function rejectJump(roomId, socketId, requestId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可审批' };

  const before = room.jumpRequests.length;
  room.jumpRequests = room.jumpRequests.filter((r) => r.id !== requestId);
  if (room.jumpRequests.length === before) return { error: '申请不存在' };

  persistRoom(room);
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

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export async function approveSkip(roomId, socketId, requestId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可审批' };

  const reqIdx = room.skipRequests.findIndex((r) => r.id === requestId);
  if (reqIdx === -1) return { error: '申请不存在' };

  room.skipRequests.splice(reqIdx, 1);
  await playNext(room, { allowFetchRandom: false });

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export function rejectSkip(roomId, socketId, requestId, connectionId = null) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (!isOwnerConnection(room, socketId, connectionId)) return { error: '仅房主可审批' };

  const before = room.skipRequests.length;
  room.skipRequests = room.skipRequests.filter((r) => r.id !== requestId);
  if (room.skipRequests.length === before) return { error: '申请不存在' };

  persistRoom(room);
  return { room: serializeRoom(room) };
}

export function addChatMessage(roomId, userId, text, options = {}) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  const content = String(text || '').trim();
  if (!content) return { error: '消息不能为空' };
  if (content.length > 500) return { error: '消息过长' };

  const user = room.users.get(userId);
  const message = {
    id: generateId(),
    userId,
    nickname: user?.nickname || '匿名',
    text: content,
    mentions: Array.isArray(options.mentions) ? options.mentions.slice(0, 10) : [],
    replyTo: options.replyTo || null,
    timestamp: Date.now(),
  };

  room.messages.push(message);
  if (room.messages.length > 100) {
    room.messages.splice(0, room.messages.length - 100);
  }

  persistRoom(room);
  return { message, room: serializeRoom(room) };
}

export function getPlaybackTime(room) {
  if (!room.current) return 0;
  if (room.isPlaying && room.current && !room.startedAt) {
    room.startedAt = Date.now() - (room.currentTime || 0) * 1000;
  }
  if (room.isPlaying && room.startedAt) {
    return (Date.now() - room.startedAt) / 1000;
  }
  return room.currentTime;
}

function serializeRoomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    userCount: room.users.size,
    hasPassword: Boolean(room.passwordHash),
    isPlaying: room.isPlaying,
    currentSong: room.current
      ? { name: room.current.name, artist: room.current.artist }
      : null,
    queueLength: room.queue.length,
    createdAt: room.createdAt,
  };
}

function repairPlaybackClock(room) {
  if (room.isPlaying && room.current && !room.startedAt) {
    room.startedAt = Date.now() - (room.currentTime || 0) * 1000;
  }
}

function serializeUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    readOnly: user.readOnly,
    joinedAt: user.joinedAt,
    location: user.location || '',
  };
}

function serializeRoom(room) {
  repairPlaybackClock(room);
  return {
    id: room.id,
    name: room.name,
    hasPassword: Boolean(room.passwordHash),
    ownerId: room.ownerId,
    creatorId: room.creatorId ?? null,
    ownerConnectionId: room.ownerConnectionId,
    queue: room.queue,
    current: room.current,
    isPlaying: room.isPlaying,
    currentTime: getPlaybackTime(room),
    users: Array.from(room.users.values()).map(serializeUser),
    userCount: room.users.size,
    jumpRequests: room.jumpRequests,
    skipRequests: room.skipRequests,
    messages: room.messages,
    songHistory: room.songHistory || [],
    randomLoading: Boolean(room.randomLoading),
  };
}

export function getRoomInternal(roomId) {
  return rooms.get(roomId);
}

export function persistRoomById(roomId) {
  const room = rooms.get(roomId);
  if (room) persistRoom(room);
}
