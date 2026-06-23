const ROOM_IDS_KEY = 'openmusic:room_ids';
const roomKey = (id) => `openmusic:room:${id}`;

let redisClient = null;
let enabled = false;

function parseRedisDb(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function buildRedisOptions() {
  const url = (process.env.REDIS_URL || '').trim();
  const host = (process.env.REDIS_HOST || '').trim();

  if (!url && !host) return null;

  const username = (process.env.REDIS_USERNAME || '').trim();
  const password = (process.env.REDIS_PASSWORD || '').trim();
  const database = parseRedisDb(process.env.REDIS_DB);

  if (url) {
    const options = { url };
    if (username) options.username = username;
    if (password) options.password = password;
    if (database !== undefined) options.database = database;
    return options;
  }

  const port = parseInt(process.env.REDIS_PORT || '6379', 10) || 6379;
  const options = {
    socket: { host, port },
  };
  if (username) options.username = username;
  if (password) options.password = password;
  if (database !== undefined) options.database = database;
  return options;
}

function describeRedisTarget(options) {
  if (options.url) {
    try {
      const parsed = new URL(options.url);
      const db = options.database ?? (parsed.pathname?.replace(/^\//, '') || '0');
      return `${parsed.hostname}:${parsed.port || 6379} db=${db}`;
    } catch {
      return 'REDIS_URL';
    }
  }
  const host = options.socket?.host || 'localhost';
  const port = options.socket?.port || 6379;
  const db = options.database ?? 0;
  return `${host}:${port} db=${db}`;
}

export function isRedisEnabled() {
  return enabled;
}

export function getRedisClient() {
  return enabled ? redisClient : null;
}

export async function initRoomStorage() {
  const options = buildRedisOptions();
  if (!options) {
    console.log('Redis: 未配置（REDIS_URL 或 REDIS_HOST），房间数据仅保存在内存');
    return false;
  }

  try {
    const { createClient } = await import('redis');
    redisClient = createClient(options);
    redisClient.on('error', (err) => {
      console.error('Redis 错误:', err.message);
    });
    await redisClient.connect();
    enabled = true;
    console.log(`Redis: 已连接 ${describeRedisTarget(options)}，房间数据将持久化`);
    return true;
  } catch (err) {
    console.error('Redis: 连接失败，回退到内存存储 —', err.message);
    redisClient = null;
    enabled = false;
    return false;
  }
}

export async function loadAllRoomsFromStorage() {
  if (!enabled || !redisClient) return [];

  const ids = await redisClient.sMembers(ROOM_IDS_KEY);
  const rooms = [];

  for (const id of ids) {
    try {
      const raw = await redisClient.get(roomKey(id));
      if (!raw) continue;
      rooms.push(JSON.parse(raw));
    } catch (err) {
      console.error(`Redis: 跳过损坏的房间数据 ${id}:`, err.message);
    }
  }

  return rooms;
}

export async function saveRoomToStorage(roomSnapshot) {
  if (!enabled || !redisClient) return;

  const payload = JSON.stringify(roomSnapshot);
  try {
    await redisClient.set(roomKey(roomSnapshot.id), payload);
    await redisClient.sAdd(ROOM_IDS_KEY, roomSnapshot.id);
  } catch (err) {
    console.error(`Redis: 保存房间 ${roomSnapshot.id} 失败:`, err.message);
  }
}

/** 异步持久化，避免 JSON 序列化阻塞 HTTP / Socket 热路径 */
export function queueSaveRoomToStorage(roomSnapshot) {
  if (!enabled || !redisClient) return;

  setImmediate(() => {
    void saveRoomToStorage(roomSnapshot);
  });
}

export async function deleteRoomFromStorage(roomId) {
  if (!enabled || !redisClient) return;

  try {
    await redisClient.del(roomKey(roomId));
    await redisClient.sRem(ROOM_IDS_KEY, roomId);
  } catch (err) {
    console.error(`Redis: 删除房间 ${roomId} 失败:`, err.message);
  }
}

const FAVORITES_PREFIX = 'openmusic:favorites:';
const MAX_FAVORITES = 5000;
const memoryFavorites = new Map();

function favoriteKey(userId) {
  return `${FAVORITES_PREFIX}${userId}`;
}

function songFavoriteId(song) {
  return `${song?.source || 'netease'}:${song?.id || ''}`;
}

function normalizeFavoriteSong(song) {
  if (!song || typeof song !== 'object') return null;
  const id = String(song.id || '').trim();
  const source = String(song.source || 'netease').trim();
  const name = String(song.name || '').trim();
  const artist = String(song.artist || '').trim();
  if (!id || !source || !name) return null;
  return {
    id,
    source,
    name,
    artist,
    album: String(song.album || '').trim(),
    pic: String(song.pic || '').trim(),
    duration: Number.isFinite(Number(song.duration)) ? Number(song.duration) : undefined,
    url: song.url ? String(song.url) : undefined,
    lrc: song.lrc ? String(song.lrc) : undefined,
    favoritedAt: Date.now(),
  };
}

async function readFavorites(userId) {
  if (!enabled || !redisClient) return memoryFavorites.get(userId) || [];
  const raw = await redisClient.get(favoriteKey(userId));
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function capFavorites(items) {
  return items.slice(0, MAX_FAVORITES);
}

async function writeFavorites(userId, items) {
  const capped = capFavorites(items);
  if (!enabled || !redisClient) {
    memoryFavorites.set(userId, capped);
    return;
  }
  await redisClient.set(favoriteKey(userId), JSON.stringify(capped));
}

export async function listFavoriteSongs(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];
  return readFavorites(id);
}

export async function setFavoriteSong(userId, song, favorite) {
  const id = String(userId || '').trim();
  const clean = normalizeFavoriteSong(song);
  if (!id || !clean) return { error: '收藏歌曲无效' };

  const items = await readFavorites(id);
  const favId = songFavoriteId(clean);
  const exists = items.some((item) => songFavoriteId(item) === favId);
  let next = items;

  if (favorite && !exists) {
    next = capFavorites([clean, ...items]);
  } else if (!favorite && exists) {
    next = items.filter((item) => songFavoriteId(item) !== favId);
  }

  await writeFavorites(id, next);
  return { favorites: next, favorite: Boolean(favorite) };
}

export async function importFavoriteSongs(userId, songs) {
  const id = String(userId || '').trim();
  if (!id) return { error: '用户身份无效' };
  if (!Array.isArray(songs)) return { error: '收藏数据格式无效' };

  const imported = songs.map(normalizeFavoriteSong).filter(Boolean);
  if (imported.length === 0) return { error: '没有可导入的歌曲' };

  const items = await readFavorites(id);
  const merged = [...imported, ...items];
  const seen = new Set();
  const next = [];
  const existingIds = new Set(items.map(songFavoriteId));
  let added = 0;
  let uniqueTotal = 0;

  for (const song of merged) {
    const favId = songFavoriteId(song);
    if (seen.has(favId)) continue;
    seen.add(favId);
    uniqueTotal += 1;
    if (!existingIds.has(favId)) added += 1;
    next.push(song);
    if (next.length >= MAX_FAVORITES) break;
  }

  const dropped = Math.max(0, uniqueTotal - next.length);

  await writeFavorites(id, next);
  return { favorites: next, imported: added, dropped, maxFavorites: MAX_FAVORITES };
}
