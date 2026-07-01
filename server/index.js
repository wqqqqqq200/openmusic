import './loadEnv.js';
import { resizeCoverForThumb } from './coverUrl.js';
import { serveUpstreamMedia } from './mediaProxy.js';
import { buildRobotsTxt, buildSitemapXml, resolveSiteOrigin } from '../shared/seoFiles.mjs';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  collectDeviceIdsForUser,
  getUserIdForDevice,
  isAccessBanned,
  linkDeviceToUser,
  sanitizeDeviceId,
} from './deviceIdentity.js';
import {
  createRoom,
  getRoomPublic,
  getRoom,
  listRooms,
  listRoomIds,
  verifyRoomPassword,
  roomExists,
  initRooms,
  isRedisEnabled,
  addUser,
  removeUser,
  renameUser,
  renameRoom,
  setRoomLock,
  setRoomAudioQuality,
  setRoomMemberTier,
  removeRoomMemberTier,
  setRoomMemberSettings,
  postMemberWelcomeMessage,
  setRoomFmMode,
  setRoomAnnouncement,
  setSongRequestEnabled,
  setChatMute,
  addToQueue,
  removeFromQueue,
  clearQueue,
  skipSong,
  finishCurrentSong,
  ensurePlayback,
  retryStuckRandomLoading,
  markRandomLoading,
  setPlaying,
  seekTo,
  getRoomInternal,
  buildPlaybackState,
  requestJump,
  toggleQueueLike,
  approveJump,
  rejectJump,
  requestSkip,
  approveSkip,
  rejectSkip,
  addChatMessage,
  toggleChatReaction,
  getChatHistoryForUser,
  getSongHistory,
  INITIAL_CHAT_LIMIT,
  advancePlaybackIfEnded,
  getPlaybackTime,
  canUserMutate,
  kickUser,
  transferOwner,
  setRoomAdmin,
  updateUserLocation,
  reportTrackDuration,
  setOnRoomPrefetchReady,
  serializeRoomForViewer,
} from './roomManager.js';
import {
  isCyapiConfigured,
  searchKugouMusic,
  getKugouSongDetail,
} from './cyapi.js';
import { importNeteasePlaylist, importQqPlaylist, fetchNeteasePlaylistMetas } from './playlistImport.js';
import { fetchNeteaseHotToplist } from './neteaseToplist.js';
import { importFavoriteSongs, listFavoriteSongs, setFavoriteSong } from './roomStorage.js';
import { recordSongRequest, getHotSongs } from './songHotRank.js';
import {
  createChatImageUploadToken,
  isQiniuConfigured,
} from './qiniuOss.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const METING_API_URL = (process.env.METING_API_URL ).replace(/\/$/, '');
const METING_API_AUTH = process.env.METING_API_AUTH || '';
const VMY_LRC_URL = (process.env.VMY_LRC_URL || 'https://api.52vmy.cn/api/music/lrc').replace(/\/$/, '');
const DISCONNECT_GRACE_MS = 1500;
const AUTO_ADVANCE_INTERVAL_MS = 500;
const CLIENT_URL = (process.env.CLIENT_URL || '').replace(/\/$/, '');
const ALLOWED_ORIGINS = CLIENT_URL
  ? new Set(CLIENT_URL.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean))
  : null;
const CLIENT_ID_SECRET = process.env.CLIENT_ID_SECRET || randomBytes(32).toString('hex');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !ALLOWED_ORIGINS) {
  console.warn('安全告警: NODE_ENV=production 但未配置 CLIENT_URL，浏览器跨域请求将被拒绝');
}

const app = express();
app.set('trust proxy', 'loopback');
const httpServer = createServer(app);

function corsOrigin(origin, callback) {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (!ALLOWED_ORIGINS) {
    callback(null, !IS_PRODUCTION);
    return;
  }

  callback(null, ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')));
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
  perMessageDeflate: {
    threshold: 1024,
  },
  httpCompression: true,
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeClientIp(raw) {
  let ip = String(raw || '').replace(/^::ffff:/, '').trim();
  if (!ip) return '';

  const v4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4WithPort) return v4WithPort[1];

  return ip;
}

function getClientIpFromHeaders(headers = {}, remoteAddress = '') {
  const forwarded = headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = rawForwarded?.split(',')[0]?.trim();
  const realIp = Array.isArray(headers['x-real-ip']) ? headers['x-real-ip'][0] : headers['x-real-ip'];
  return normalizeClientIp(firstForwarded || realIp || remoteAddress || '');
}

function logIpDebug(scope, headers, remoteAddress, resolvedIp) {
  if (process.env.DEBUG_IP !== '1') return;
  console.log(`[ip-debug:${scope}]`, {
    xff: headers?.['x-forwarded-for'],
    realIp: headers?.['x-real-ip'],
    remoteAddress,
    resolvedIp,
  });
}

function getRequestIp(req) {
  const ip = getClientIpFromHeaders(req.headers, req.socket?.remoteAddress || req.ip);
  logIpDebug('http', req.headers, req.socket?.remoteAddress || req.ip, ip);
  return ip;
}

function getClientIp(socket) {
  const headers = socket.request?.headers || socket.handshake.headers || {};
  const remoteAddress = socket.request?.socket?.remoteAddress || socket.handshake.address;
  const ip = getClientIpFromHeaders(headers, remoteAddress);
  logIpDebug('socket', headers, remoteAddress, ip);
  return ip;
}

function isPrivateIp(ip) {
  return (
    !ip
    || ip === '::1'
    || ip === '127.0.0.1'
    || ip.startsWith('10.')
    || ip.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    || /^fc|^fd/i.test(ip)
  );
}
const ipLocationCache = new Map();
const IP_LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function normalizeLocationName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .replace(/^(中国|中华人民共和国)/, '')
    .replace(/(省|市|特别行政区|自治区|壮族自治区|回族自治区|维吾尔自治区)$/u, '')
    .slice(0, 12);
}

function parseBaiduIpLocation(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';

  const area = text.split(/\s+/)[0] || '';
  const match = area.match(/(.*?省|北京市|上海市|天津市|重庆市|.*?自治区|.*?特别行政区)/u);
  if (match?.[0]) return normalizeLocationName(match[0]);

  return normalizeLocationName(area);
}

function fallbackLocationForIp(ip) {
  if (!ip || isPrivateIp(ip)) return '本地';
  return '未知';
}

async function lookupIpLocation(ip) {
  const normalized = normalizeClientIp(ip);
  if (!normalized || isPrivateIp(normalized)) return fallbackLocationForIp(normalized);

  const cached = ipLocationCache.get(normalized);
  if (cached && Date.now() - cached.updatedAt < IP_LOCATION_CACHE_TTL_MS) {
    return cached.location;
  }

  let location = '未知';
  try {
    const response = await fetchWithTimeout(
      `https://opendata.baidu.com/api.php?query=${encodeURIComponent(normalized)}&co=&resource_id=6006&oe=utf8`,
      {},
      1200,
    );
    if (response.ok) {
      const data = await response.json();
      if (String(data?.status) === '0') {
        location = parseBaiduIpLocation(data?.data?.[0]?.location) || location;
      }
    }
  } catch {
    location = fallbackLocationForIp(normalized);
  }

  ipLocationCache.set(normalized, { location, updatedAt: Date.now() });
  return location;
}

function attachUserLocation(roomId, userId, ip) {
  const initialLocation = fallbackLocationForIp(ip);
  updateUserLocation(roomId, userId, initialLocation);

  void lookupIpLocation(ip).then((location) => {
    const updated = updateUserLocation(roomId, userId, location);
    if (updated) broadcastRoomUpdate(roomId);
  }).catch(() => {});
}

const VALID_SOURCES = new Set(['netease', 'tencent', 'kugou']);

function limitText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}

const limitRoomCreate = createRateLimiter({ windowMs: 60_000, max: 20 });
const limitJoinAttempt = createRateLimiter({ windowMs: 60_000, max: 30 });
const limitProxyRequest = createRateLimiter({ windowMs: 60_000, max: 120 });
const limitSocketAction = createRateLimiter({ windowMs: 60_000, max: 90 });
const limitSocketChat = createRateLimiter({ windowMs: 60_000, max: 30 });

function sanitizeClientSong(song) {
  if (!song || typeof song !== 'object') {
    return { error: '歌曲数据无效' };
  }

  const source = VALID_SOURCES.has(song.source) ? song.source : 'netease';
  const id = limitText(song.id, 128);
  const name = limitText(song.name, 100);
  const artist = limitText(song.artist, 100) || '未知歌手';

  if (!id || !name) {
    return { error: '歌曲数据缺少 id 或名称' };
  }

  const duration = Number(song.duration);
  const sanitized = {
    id,
    source,
    name,
    artist,
    album: limitText(song.album, 100) || undefined,
    pic: limitText(song.pic, 1000) || undefined,
    duration: Number.isFinite(duration) && duration > 0 && duration < 24 * 60 * 60 * 1000
      ? duration
      : undefined,
  };

  // 歌词/播放 URL 由客户端按需拉取，服务端不持久化。
  return { song: sanitized };
}

function buildMetingUrl(query) {
  const params = new URLSearchParams(query);
  if (METING_API_AUTH && !params.has('auth')) {
    params.set('auth', METING_API_AUTH);
  }
  return `${METING_API_URL}/api?${params.toString()}`;
}

function parseMetingPicQuery(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('type') !== 'pic') return null;
    const server = parsed.searchParams.get('server');
    const id = parsed.searchParams.get('id');
    if (!server || !id) return null;
    return { server, id };
  } catch {
    return null;
  }
}

/** media-proxy 误收到 Meting pic API 时，先解析为真实图片 CDN 地址 */
async function resolveMediaProxyFetchUrl(fetchUrl, thumbPx = 0) {
  const pic = parseMetingPicQuery(fetchUrl);
  if (!pic) return fetchUrl;

  try {
    const response = await fetchWithTimeout(
      buildMetingUrl({ server: pic.server, type: 'pic', id: pic.id }),
      { redirect: 'manual' },
      15000,
    );

    if (response.status >= 300 && response.status < 400) {
      let location = response.headers.get('location');
      if (location && thumbPx > 0) location = resizeCoverForThumb(location, thumbPx);
      return location || fetchUrl;
    }

    const text = (await response.text()).trim();
    if (text.startsWith('http')) {
      let direct = text.startsWith('@') ? text.slice(1) : text;
      if (thumbPx > 0) direct = resizeCoverForThumb(direct, thumbPx);
      return direct;
    }
  } catch (err) {
    console.error('Meting pic resolve error:', err.message);
  }

  return fetchUrl;
}

async function proxyMetingResponse(targetUrl, res, thumbPx = 0) {
  const response = await fetchWithTimeout(targetUrl, { redirect: 'manual' });

  if (response.status >= 300 && response.status < 400) {
    let location = response.headers.get('location');
    if (location && thumbPx > 0) {
      location = resizeCoverForThumb(location, thumbPx);
    }
    if (location) return res.redirect(response.status, location);
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (contentType.includes('application/json') || text.startsWith('[') || text.startsWith('{')) {
    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.type('text').send(text);
    }
  }

  return res.type('text').send(text);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/music/hot', async (req, res) => {
  const limit = parseInt(String(req.query.limit || ''), 10);
  try {
    const songs = await getHotSongs(Number.isFinite(limit) ? limit : 20);
    res.json(songs);
  } catch (err) {
    console.error('Hot songs error:', err.message);
    res.status(500).json({ error: '获取热榜失败' });
  }
});

app.get('/api/music/toplist/netease', async (req, res) => {
  if (!limitProxyRequest(`toplist:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const limit = parseInt(String(req.query.limit || ''), 10);
  try {
    const data = await fetchNeteaseHotToplist(Number.isFinite(limit) ? limit : 200);
    res.json(data);
  } catch (err) {
    console.error('Netease toplist error:', err.message);
    res.status(502).json({ error: err.message || '获取网易云热榜失败' });
  }
});

app.get('/api/music/netease/playlists/meta', async (req, res) => {
  if (!limitProxyRequest(`playlist-meta:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const ids = String(req.query.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (ids.length === 0) {
    return res.json({ playlists: [] });
  }

  try {
    const playlists = await fetchNeteasePlaylistMetas(ids);
    res.json({ playlists });
  } catch (err) {
    console.error('Netease playlist meta error:', err.message);
    res.status(502).json({ error: '获取歌单信息失败' });
  }
});

app.get('/api/music/netease/playlists/search', async (req, res) => {
  if (!limitProxyRequest(`playlist-search:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const keyword = limitText(req.query.keyword || req.query.s, 80);
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  if (!keyword) return res.json({ playlists: [], total: 0, page, limit });

  try {
    const targetUrl = buildMetingUrl({ server: 'netease', type: 'search_playlist', id: keyword });
    const response = await fetchWithTimeout(targetUrl, {}, 10000);
    if (!response.ok) return res.status(response.status).json({ error: '网易云歌单搜索失败' });
    const data = await response.json();
    const playlists = Array.isArray(data) ? data : [];
    const normalized = playlists.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || item.title || '未命名歌单'),
      coverImgUrl: String(item.cover || item.coverImgUrl || item.pic || ''),
      creatorName: String(item.creator?.nickname || item.creator?.name || item.user?.nickname || ''),
      trackCount: Number(item.trackCount || item.track_count || item.song_count || 0),
      playCount: Number(item.playCount || item.playcount || 0),
    })).filter((item) => item.id);
    const start = (page - 1) * limit;
    res.json({
      page,
      limit,
      total: normalized.length,
      playlists: normalized.slice(start, start + limit),
    });
  } catch (err) {
    console.error('Netease playlist search error:', err.message);
    res.status(502).json({ error: '网易云歌单搜索失败' });
  }
});

app.get('/api/music/sources', (_req, res) => {
  const sources = [
    {
      id: 'netease',
      name: '网易云音乐',
      shortName: '网易',
      color: '#ec4141',
      supportsSearch: true,
      supportsIdLookup: true,
    },
    {
      id: 'tencent',
      name: 'QQ音乐',
      shortName: 'QQ',
      color: '#31c27c',
      supportsSearch: true,
      supportsIdLookup: false,
    },
    {
      id: 'kugou',
      name: '酷狗音乐',
      shortName: '酷狗',
      color: '#2688ee',
      supportsSearch: isCyapiConfigured(),
      supportsIdLookup: false,
      description: isCyapiConfigured() ? '通过迟言 API 搜索' : '请配置 CYAPI_KEY（酷狗）',
    },
  ];
  res.json(sources);
});

app.get('/api/meting', async (req, res) => {
  if (!limitProxyRequest(`meting:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  try {
    const thumbPx = parseInt(String(req.query.size || ''), 10) || 0;
    const query = { ...req.query };
    delete query.size;
    await proxyMetingResponse(buildMetingUrl(query), res, thumbPx);
  } catch (err) {
    console.error('Meting proxy error:', err.message);
    res.status(502).json({ error: '无法连接 Meting API，请检查 METING_API_URL 配置' });
  }
});

/** HTTPS 站点下代理 http 音频/封面，避免浏览器混合内容警告 */
app.get('/api/media-proxy', async (req, res) => {
  if (!limitProxyRequest(`media:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const raw = String(req.query.url || '').trim();
  const thumbPx = Math.min(512, Math.max(0, parseInt(String(req.query.size || ''), 10) || 0));
  let fetchUrl = raw;
  let parsed;
  try {
    parsed = new URL(fetchUrl);
  } catch {
    return res.status(400).json({ error: '无效地址' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: '不支持的协议' });
  }

  if (isPrivateHostname(parsed.hostname)) {
    return res.status(403).json({ error: '禁止访问内网地址' });
  }

  try {
    if (parseMetingPicQuery(raw)) {
      fetchUrl = await resolveMediaProxyFetchUrl(raw, thumbPx);
    } else if (thumbPx > 0) {
      fetchUrl = resizeCoverForThumb(raw, thumbPx);
    } else {
      fetchUrl = raw;
    }

    await serveUpstreamMedia(fetchUrl, res, fetchWithTimeout, {
      range: req.headers.range,
      thumbPx,
    });
  } catch (err) {
    console.error('Media proxy error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: '媒体代理失败' });
  }
});

/** cyapi 酷狗音乐搜索 */
app.get('/api/music/cyapi/kugou/search', async (req, res) => {
  if (!limitProxyRequest(`kugou:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!isCyapiConfigured()) {
    return res.status(503).json({ error: '未配置 CYAPI_KEY' });
  }

  const keyword = String(req.query.q || '').trim();
  const num = Math.min(Math.max(parseInt(String(req.query.num || '15'), 10) || 15, 1), 30);

  if (!keyword) return res.json([]);

  try {
    res.json(await searchKugouMusic(keyword, num));
  } catch (err) {
    console.error('Cyapi Kugou search error:', err.message);
    res.status(502).json({ error: '酷狗音乐搜索失败' });
  }
});

/** 导入外部歌单（网易云 / QQ 音乐分享链接） */
app.post('/api/music/playlist/import', async (req, res) => {
  if (!limitProxyRequest(`playlist:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const platform = String(req.body?.platform || '').trim();
  const input = String(req.body?.input || '').trim();
  if (!input) return res.status(400).json({ error: '请粘贴歌单分享链接' });
  if (platform !== 'netease' && platform !== 'qq') {
    return res.status(400).json({ error: '不支持的平台' });
  }

  try {
    const result = platform === 'netease'
      ? await importNeteasePlaylist(input)
      : await importQqPlaylist(input);
    res.json(result);
  } catch (err) {
    console.error('Playlist import error:', err.message);
    res.status(400).json({ error: err.message || '歌单导入失败' });
  }
});

/** cyapi 酷狗音乐详情（播放链接、歌词） */
app.get('/api/music/cyapi/kugou/song', async (req, res) => {
  if (!limitProxyRequest(`kugou-song:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  if (!isCyapiConfigured()) {
    return res.status(503).json({ error: '未配置 CYAPI_KEY' });
  }

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: '缺少歌曲 id' });

  try {
    const detail = await getKugouSongDetail(id);
    if (!detail) return res.status(404).json({ error: '歌曲不存在' });
    res.json(detail);
  } catch (err) {
    console.error('Cyapi Kugou song error:', err.message);
    res.status(502).json({ error: '酷狗音乐获取失败' });
  }
});

/** 歌词备用：52vmy，按歌名搜索 */
app.get('/api/music/lrc-fallback', async (req, res) => {
  if (!limitProxyRequest(`lrc:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const msg = String(req.query.msg || '').trim();
  const n = String(req.query.n || '1');
  if (!msg) return res.status(400).json({ error: '缺少歌曲名' });

  try {
    const params = new URLSearchParams({ msg, n });
    const response = await fetchWithTimeout(`${VMY_LRC_URL}?${params}`);
    if (!response.ok) {
      return res.status(502).json({ error: '歌词接口请求失败' });
    }
    const text = await response.text();
    res.type('text/plain; charset=utf-8').send(text);
  } catch (err) {
    console.error('LRC fallback error:', err.message);
    res.status(502).json({ error: '歌词获取失败' });
  }
});

const IDENTITY_UID_COOKIE = 'openmusic_uid';
const IDENTITY_TOKEN_COOKIE = 'openmusic_token';
const DEVICE_ID_COOKIE = 'openmusic_did';
const IDENTITY_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365 * 5;

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeClientId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : '';
}

function signClientId(clientId) {
  return createHmac('sha256', CLIENT_ID_SECRET).update(clientId).digest('base64url');
}

function verifyClientToken(clientId, token) {
  const id = sanitizeClientId(clientId);
  const rawToken = String(token || '').trim();
  if (!id || !rawToken) return false;

  try {
    const expected = Buffer.from(signClientId(id));
    const actual = Buffer.from(rawToken);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function createServerClientId() {
  return randomBytes(18).toString('base64url');
}

function setIdentityCookieHeaders(res, userId, token, deviceId = null) {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  const base = `Path=/; Max-Age=${IDENTITY_COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`;
  const cookies = [
    `${IDENTITY_UID_COOKIE}=${encodeURIComponent(userId)}; ${base}`,
    `${IDENTITY_TOKEN_COOKIE}=${encodeURIComponent(token)}; ${base}`,
  ];
  const did = sanitizeDeviceId(deviceId);
  if (did) {
    cookies.push(`${DEVICE_ID_COOKIE}=${encodeURIComponent(did)}; ${base}`);
  }
  res.setHeader('Set-Cookie', cookies);
}

function resolveDeviceIdFromRequest(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  const fromCookie = sanitizeDeviceId(cookies[DEVICE_ID_COOKIE]);
  const fromBody = sanitizeDeviceId(req.body?.deviceId);
  return fromCookie || fromBody || null;
}

function resolveDeviceIdFromCookieHeader(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader || '');
  return sanitizeDeviceId(cookies[DEVICE_ID_COOKIE]);
}

function resolveIdentityFromCookies(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const userId = sanitizeClientId(cookies[IDENTITY_UID_COOKIE]);
  const token = String(cookies[IDENTITY_TOKEN_COOKIE] || '').trim();
  if (userId && verifyClientToken(userId, token)) {
    return { userId, token };
  }
  return null;
}

function resolveIdentityFromRequest(req) {
  return resolveIdentityFromCookies(req.headers?.cookie || '');
}

/** 建立 HttpOnly 会话：身份凭证仅通过 Cookie 传递，不经 WebSocket 明文下发 */
app.post('/api/session/bootstrap', async (req, res) => {
  const hintedDeviceId = resolveDeviceIdFromRequest(req);

  const existing = resolveIdentityFromRequest(req);
  if (existing) {
    const deviceId = hintedDeviceId || createServerClientId();
    await linkDeviceToUser(deviceId, existing.userId);
    setIdentityCookieHeaders(res, existing.userId, signClientId(existing.userId), deviceId);
    return res.json({ clientId: existing.userId });
  }

  // 无身份 Cookie 时，仅允许通过已登记的本机设备 ID 恢复同一 userId（不可指定任意 userId）
  if (hintedDeviceId) {
    const boundUserId = await getUserIdForDevice(hintedDeviceId);
    if (boundUserId) {
      await linkDeviceToUser(hintedDeviceId, boundUserId);
      setIdentityCookieHeaders(res, boundUserId, signClientId(boundUserId), hintedDeviceId);
      return res.json({ clientId: boundUserId });
    }
  }

  const userId = createServerClientId();
  const deviceId = hintedDeviceId || createServerClientId();
  await linkDeviceToUser(deviceId, userId);
  setIdentityCookieHeaders(res, userId, signClientId(userId), deviceId);
  return res.json({ clientId: userId });
});

app.get('/api/rooms', (_req, res) => {
  res.json(listRooms());
});

app.post('/api/rooms', (req, res) => {
  if (!limitRoomCreate(`room:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '创建房间过于频繁，请稍后再试' });
  }

  const name = req.body?.name;
  const password = req.body?.password;
  const identity = resolveIdentityFromRequest(req);
  if (!identity?.userId) {
    return res.status(401).json({ error: '会话未就绪，请刷新页面后重试' });
  }
  const room = createRoom({ name, password, creatorId: identity.userId });
  res.json(room);
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoomPublic(req.params.id);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  res.json(room);
});

app.get('/api/chat/upload-config', (_req, res) => {
  res.json({ enabled: isQiniuConfigured() });
});

app.post('/api/chat/upload-token', (req, res) => {
  if (!isQiniuConfigured()) {
    return res.status(503).json({ error: '图片上传未配置' });
  }

  if (!limitProxyRequest(`chat-upload:${getRequestIp(req)}`)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const roomId = limitText(req.body?.roomId, 32);
  const ext = limitText(req.body?.ext, 8).toLowerCase();
  if (!roomId) {
    return res.status(400).json({ error: '房间无效' });
  }

  const identity = resolveIdentityFromRequest(req);
  if (!identity?.userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const room = getRoomInternal(roomId);
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }

  if (!room.users.has(identity.userId)) {
    return res.status(403).json({ error: '未加入房间' });
  }

  if (room.muteAll || room.mutedUserIds?.has(identity.userId)) {
    return res.status(403).json({ error: room.muteAll ? '当前房间已全体禁言' : '你已被禁言' });
  }

  try {
    const tokenData = createChatImageUploadToken(roomId, ext);
    res.json(tokenData);
  } catch (err) {
    res.status(400).json({ error: err.message || '生成上传凭证失败' });
  }
});

const clientDist = path.join(__dirname, '../client/dist');

app.get('/robots.txt', (req, res) => {
  const origin = resolveSiteOrigin(req, ALLOWED_ORIGINS);
  res.type('text/plain').send(buildRobotsTxt(origin));
});

app.get('/sitemap.xml', (req, res) => {
  const origin = resolveSiteOrigin(req, ALLOWED_ORIGINS);
  res.type('application/xml').send(buildSitemapXml(origin));
});

app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const socketToRoom = new Map();
const socketToUserId = new Map();

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost') return true;
  if (host.endsWith('.local')) return true;
  return isPrivateIp(host);
}

function getSocketUserId(socket) {
  return socketToUserId.get(socket.id) || socket.id;
}

function rejectReadOnly(socket, callback) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) {
    callback?.({ success: false, error: '未加入房间' });
    return true;
  }

  if (!canUserMutate(roomId, getSocketUserId(socket))) {
    callback?.({ success: false, error: '只读端无法执行此操作' });
    return true;
  }

  return false;
}

function rejectRateLimited(socket, limiter, kind, callback) {
  if (!limiter(`${kind}:${socket.id}`)) {
    callback?.({ success: false, error: '操作过于频繁，请稍后再试' });
    return true;
  }
  return false;
}

function getViewerRoomPayload(socket, roomId) {
  return serializeRoomForViewer(roomId, getSocketUserId(socket));
}

function broadcastRoomUpdate(roomId) {
  const normalized = roomId?.toUpperCase();
  if (!normalized) return;
  const sockets = io.sockets.adapter.rooms.get(normalized);
  if (!sockets?.size) return;

  for (const sid of sockets) {
    const viewerId = socketToUserId.get(sid);
    const payload = serializeRoomForViewer(normalized, viewerId);
    if (payload) io.to(sid).emit('room_update', payload);
  }
}

function broadcastPlaybackState(roomId) {
  const internal = getRoomInternal(roomId);
  if (!internal) return;
  const state = buildPlaybackState(internal);
  if (state) io.to(roomId).emit('playback_state', state);
}

setOnRoomPrefetchReady((roomId) => {
  broadcastRoomUpdate(roomId);
});

function emitRoomAndPlayback(roomId, room) {
  broadcastRoomUpdate(roomId);
  broadcastPlaybackState(roomId);

  if (room?.randomLoading && !room.current) {
    ensurePlayback(roomId).then((nextRoom) => {
      if (!nextRoom) return;
      if (nextRoom.current) {
        emitRoomAndPlayback(roomId, nextRoom);
        return;
      }
      broadcastRoomUpdate(roomId);
      broadcastPlaybackState(roomId);
    }).catch((err) => {
      console.error('Ensure playback after loading state failed:', err.message);
    });
  }
}

async function advanceEndedRoomNow(roomId, expectedQueueId = '') {
  const internal = getRoomInternal(roomId);
  if (!internal?.current || !internal.isPlaying) return null;
  if (expectedQueueId && internal.current.queueId !== expectedQueueId) return null;

  const beforeQueueId = internal.current.queueId;
  const beforePosition = getPlaybackTime(internal);
  const advanced = await advancePlaybackIfEnded(roomId, {
    force: Boolean(expectedQueueId),
    expectedQueueId,
  });
  if (!advanced) return null;
  if (advanced.current?.queueId === beforeQueueId) return null;

  emitRoomAndPlayback(roomId, advanced);
  console.log('playback auto advanced', {
    roomId,
    from: beforeQueueId,
    at: beforePosition.toFixed(2),
    to: advanced.current?.queueId || 'loading',
  });
  return advanced;
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, nickname, password, readOnly }, callback) => {
    const id = roomId?.toUpperCase();
    if (!roomExists(id)) {
      callback?.({ success: false, error: '房间不存在' });
      return;
    }

    const ip = getClientIp(socket);
    if (!limitJoinAttempt(`join:${ip}:${id}`)) {
      callback?.({ success: false, error: '尝试过于频繁，请稍后再试' });
      return;
    }

    const cookieIdentity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    const userId = Boolean(readOnly)
      ? createServerClientId()
      : (cookieIdentity?.userId || createServerClientId());

    if (!readOnly && !cookieIdentity) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试', needsSession: true });
      return;
    }

    const auth = verifyRoomPassword(id, password, { clientId: userId });
    if (!auth.ok) {
      callback?.({ success: false, error: auth.error, needsPassword: auth.needsPassword });
      return;
    }

    const deviceId = resolveDeviceIdFromCookieHeader(socket.handshake?.headers?.cookie || '');
    const joinRoomInternal = getRoomInternal(id);
    if (joinRoomInternal && isAccessBanned(joinRoomInternal, userId, deviceId)) {
      callback?.({ success: false, error: '你已被移出该房间，无法再次进入' });
      return;
    }

    if (deviceId && !Boolean(readOnly)) {
      void linkDeviceToUser(deviceId, userId);
    }

    const prevRoomId = socketToRoom.get(socket.id);
    const prevUserId = getSocketUserId(socket);
    if (prevRoomId && prevRoomId !== id) {
      socket.leave(prevRoomId);
      const prevResult = removeUser(prevRoomId, prevUserId, socket.id);
      if (prevResult && !prevResult.empty) {
        broadcastRoomUpdate(prevRoomId);
      }
    }

    // 同一连接再次加入同一房间，但解析出的用户身份不同（如身份令牌尚未持久化、
    // 快速重连或 StrictMode 重复挂载）：先移除旧的占位用户，避免一个浏览器出现多个用户。
    if (prevRoomId === id && prevUserId && prevUserId !== userId) {
      removeUser(id, prevUserId, socket.id);
    }

    const joinInternalBefore = getRoomInternal(id);
    const priorUser = joinInternalBefore?.users?.get(userId);
    const hadActiveSession = Boolean(
      priorUser && (
        (Array.isArray(priorUser.connectionIds) && priorUser.connectionIds.length > 0)
        || priorUser.connectionId
      ),
    );

    const clientIp = getClientIp(socket);
    const joinedRoom = addUser(id, userId, nickname, {
      readOnly: Boolean(readOnly),
      connectionId: socket.id,
      location: fallbackLocationForIp(clientIp),
      deviceId: deviceId || undefined,
    });
    if (!joinedRoom) {
      callback?.({ success: false, error: '加入房间失败' });
      return;
    }
    if (joinedRoom.error) {
      callback?.({ success: false, error: joinedRoom.error });
      return;
    }

    socketToRoom.set(socket.id, id);
    socketToUserId.set(socket.id, userId);
    socket.join(id);
    attachUserLocation(id, userId, clientIp);

    const welcomeMessage = hadActiveSession ? null : postMemberWelcomeMessage(id, userId);

    // 无当前歌曲且队列为空时，加入后会异步拉取随机歌曲，先告知客户端"加载中"，
    // 避免播放条在随机歌曲到达前直接消失。
    const loadingRoom = markRandomLoading(id);
    const roomPayload = loadingRoom || joinedRoom;
    const chatHistory = getChatHistoryForUser(id, userId, { limit: INITIAL_CHAT_LIMIT });
    const joinInternal = getRoomInternal(id);
    const playbackState = joinInternal ? buildPlaybackState(joinInternal) : null;

    const joinUser = joinInternal?.users.get(userId);
    broadcastRoomUpdate(id);
    if (welcomeMessage) {
      socket.to(id).emit('chat_message', welcomeMessage);
    }
    callback?.({
      success: true,
      room: serializeRoomForViewer(id, userId) || roomPayload,
      messages: chatHistory.messages || [],
      chatHasMore: Boolean(chatHistory.hasMore),
      playbackState,
      socketId: userId,
      nickname: joinUser?.nickname
        || roomPayload.users?.find((user) => user.id === userId)?.nickname
        || String(nickname || '').trim(),
      isOwner: roomPayload.creatorId === userId,
      isAdmin: (roomPayload.adminIds || []).includes(userId),
      canControlPlayback: roomPayload.creatorId === userId || (roomPayload.adminIds || []).includes(userId),
      isPlaybackLeader: roomPayload.ownerId === userId,
    });

    ensurePlayback(id).then((room) => {
      if (room) emitRoomAndPlayback(id, room);
    }).catch((err) => {
      console.error('Ensure playback after join failed:', err.message);
    });
  });

  socket.on('rename_user', ({ nickname }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'rename', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const userId = getSocketUserId(socket);
    const result = renameUser(roomId, userId, nickname);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('rename_room', ({ name }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'rename_room', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = renameRoom(roomId, getSocketUserId(socket), name, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_lock', ({ locked, password }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_lock', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomLock(roomId, getSocketUserId(socket), { locked, password }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_fm_mode', ({ mode }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_fm_mode', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomFmMode(roomId, getSocketUserId(socket), mode, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_announcement', ({ enabled, text }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_announcement', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomAnnouncement(roomId, getSocketUserId(socket), { enabled, text }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_song_request', ({ enabled }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_song_request', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setSongRequestEnabled(roomId, getSocketUserId(socket), enabled, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_audio_quality', ({ netease, tencent }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_audio_quality', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomAudioQuality(roomId, getSocketUserId(socket), { netease, tencent }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_member_tier', ({ userId, tier }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_member_tier', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomMemberTier(roomId, getSocketUserId(socket), userId, tier, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('remove_room_member_tier', ({ userId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'remove_room_member_tier', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = removeRoomMemberTier(roomId, getSocketUserId(socket), userId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_room_member_settings', (settings, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_member_settings', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setRoomMemberSettings(roomId, getSocketUserId(socket), settings, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('set_chat_mute', ({ muteAll, userId, muted }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_chat_mute', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = setChatMute(roomId, getSocketUserId(socket), { muteAll, userId, muted }, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('kick_user', async ({ userId: targetUserId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'kick_user', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = await kickUser(roomId, actorId, targetUserId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);

    for (const [sid, rid] of socketToRoom.entries()) {
      if (rid !== roomId || socketToUserId.get(sid) !== targetUserId) continue;
      const kickedSocket = io.sockets.sockets.get(sid);
      socketToRoom.delete(sid);
      socketToUserId.delete(sid);
      kickedSocket?.leave(roomId);
      kickedSocket?.emit('kicked', {
        message: '你已被房主移出房间，无法再次进入',
      });
    }

    callback?.({
      success: true,
      room: getViewerRoomPayload(socket, roomId),
      message: `已移出「${result.kickedNickname}」，该用户将无法再次进入本房间`,
    });
  });

  socket.on('transfer_owner', ({ userId: targetUserId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'transfer_owner', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = transferOwner(roomId, actorId, targetUserId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId), message: result.message });
  });

  socket.on('set_room_admin', ({ userId: targetUserId, admin }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'set_room_admin', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const actorId = getSocketUserId(socket);
    const result = setRoomAdmin(roomId, actorId, targetUserId, Boolean(admin), socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId), message: result.message });
  });

  socket.on('leave_room', (_payload, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: true });
      return;
    }

    socket.leave(roomId);
    socketToRoom.delete(socket.id);
    const userId = getSocketUserId(socket);
    socketToUserId.delete(socket.id);
    const result = removeUser(roomId, userId, socket.id);
    if (result && !result.empty) {
      broadcastRoomUpdate(roomId);
    }
    callback?.({ success: true });
  });

  socket.on('add_song', async ({ song }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'add_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const clean = sanitizeClientSong(song);
    if (clean.error) {
      callback?.({ success: false, error: clean.error });
      return;
    }

    const room = getRoomInternal(roomId);
    const userId = getSocketUserId(socket);
    const user = room?.users.get(userId);
    const result = await addToQueue(roomId, clean.song, {
      id: userId,
      nickname: user?.nickname || '匿名',
    });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    recordSongRequest(clean.song);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('remove_song', ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'remove_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = removeFromQueue(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('clear_queue', (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'clear_queue', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = clearQueue(roomId, getSocketUserId(socket));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('skip_song', async (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'skip_song', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await skipSong(roomId, getSocketUserId(socket), socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('finish_song', async ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const expectedQueueId = String(queueId || '');
    const advanced = await advanceEndedRoomNow(roomId, expectedQueueId);
    if (advanced) {
      emitRoomAndPlayback(roomId, advanced);
      callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
      return;
    }

    const result = await finishCurrentSong(roomId, getSocketUserId(socket), socket.id, expectedQueueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('request_jump', async ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'request_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await requestJump(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('toggle_queue_like', ({ queueId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'toggle_queue_like', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = toggleQueueLike(roomId, getSocketUserId(socket), queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, liked: result.liked, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('approve_jump', async ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'approve_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveJump(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('reject_jump', ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'reject_jump', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectJump(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('request_skip', (_payload, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'request_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = requestSkip(roomId, getSocketUserId(socket));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('approve_skip', async ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'approve_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveSkip(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    emitRoomAndPlayback(roomId, result.room);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('reject_skip', ({ requestId }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'reject_skip', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectSkip(roomId, getSocketUserId(socket), requestId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    broadcastRoomUpdate(roomId);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('send_chat', ({ text, mentions, replyTo, imageUrl, imageKey }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketChat, 'send_chat', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = addChatMessage(roomId, getSocketUserId(socket), text, {
      mentions,
      replyTo,
      imageUrl,
      imageKey,
    });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('chat_message', result.message);
    callback?.({ success: true, message: result.message });
  });

  socket.on('toggle_chat_reaction', ({ messageId, emoji }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = toggleChatReaction(roomId, getSocketUserId(socket), messageId, emoji);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('chat_reaction_update', {
      messageId: result.messageId,
      reactions: result.reactions,
    });
    callback?.({ success: true, messageId: result.messageId, reactions: result.reactions });
  });

  socket.on('load_chat_history', ({ before, beforeId, limit }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = getChatHistoryForUser(roomId, getSocketUserId(socket), { before, beforeId, limit });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    callback?.({
      success: true,
      messages: result.messages,
      hasMore: Boolean(result.hasMore),
    });
  });

  socket.on('load_song_history', ({ limit }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = getSongHistory(roomId, { limit });
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    callback?.({ success: true, songs: result.songs });
  });

  socket.on('report_track_duration', ({ queueId, durationMs }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = reportTrackDuration(
      roomId,
      getSocketUserId(socket),
      queueId,
      durationMs,
      socket.id,
    );
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, skipped: Boolean(result.skipped) });
  });


  socket.on('list_favorites', async (_payload, callback) => {
    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }
    const favorites = await listFavoriteSongs(identity.userId);
    callback?.({ success: true, favorites });
  });

  socket.on('set_favorite', async ({ song, favorite }, callback) => {
    if (rejectRateLimited(socket, limitSocketAction, 'set_favorite', callback)) return;

    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }

    const clean = sanitizeClientSong(song);
    if (clean.error) {
      callback?.({ success: false, error: clean.error });
      return;
    }

    const result = await setFavoriteSong(identity.userId, clean.song, Boolean(favorite));
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, favorites: result.favorites, favorite: result.favorite });
  });

  socket.on('import_favorites', async ({ songs }, callback) => {
    if (rejectRateLimited(socket, limitSocketAction, 'import_favorites', callback)) return;

    const identity = resolveIdentityFromCookies(socket.handshake?.headers?.cookie || '');
    if (!identity?.userId) {
      callback?.({ success: false, error: '会话未就绪，请刷新页面后重试' });
      return;
    }

    if (!Array.isArray(songs) || songs.length === 0 || songs.length > 1000) {
      callback?.({ success: false, error: '收藏数据格式无效' });
      return;
    }

    const cleanSongs = [];
    for (const song of songs) {
      const clean = sanitizeClientSong(song);
      if (!clean.error) cleanSongs.push(clean.song);
    }

    const result = await importFavoriteSongs(identity.userId, cleanSongs);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }
    callback?.({ success: true, favorites: result.favorites, imported: result.imported, dropped: result.dropped, maxFavorites: result.maxFavorites });
  });
  socket.on('toggle_play', ({ isPlaying }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'toggle_play', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = setPlaying(roomId, getSocketUserId(socket), isPlaying, socket.id);
    if (!updated) {
      callback?.({ success: false, error: '仅房主可暂停/播放' });
      return;
    }
    emitRoomAndPlayback(roomId, updated);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('seek', ({ time }, callback) => {
    if (rejectReadOnly(socket, callback)) return;
    if (rejectRateLimited(socket, limitSocketAction, 'seek', callback)) return;

    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = seekTo(roomId, getSocketUserId(socket), time, socket.id);
    if (!updated) {
      callback?.({ success: false, error: '仅房主可调节进度' });
      return;
    }
    emitRoomAndPlayback(roomId, updated);
    callback?.({ success: true, room: getViewerRoomPayload(socket, roomId) });
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const userId = getSocketUserId(socket);
    socketToRoom.delete(socket.id);
    socketToUserId.delete(socket.id);

    setTimeout(() => {
      const result = removeUser(roomId, userId, socket.id);
      if (result?.deleted || result?.empty) return;
      broadcastRoomUpdate(roomId);
      broadcastPlaybackState(roomId);
    }, DISCONNECT_GRACE_MS);
  });
});

let autoAdvanceRunning = false;

async function checkAutoAdvance() {
  if (autoAdvanceRunning) return;
  autoAdvanceRunning = true;

  try {
    for (const roomId of listRoomIds()) {
      const internal = getRoomInternal(roomId);
      if (!internal || internal.users.size === 0) continue;

      if (internal.randomLoading && !internal.current) {
        const retried = await retryStuckRandomLoading(roomId);
        if (retried) {
          emitRoomAndPlayback(roomId, retried);
        }
        continue;
      }

      if (!internal.isPlaying || !internal.current) continue;

      const advanced = await advancePlaybackIfEnded(roomId);
      if (advanced) {
        emitRoomAndPlayback(roomId, advanced);
      }
    }
  } finally {
    autoAdvanceRunning = false;
  }
}

setInterval(() => {
  void checkAutoAdvance();
}, AUTO_ADVANCE_INTERVAL_MS);

await initRooms();

httpServer.listen(PORT, () => {
  console.log(`🎵 OpenMusic 服务运行在 http://localhost:${PORT}`);
  console.log(`📡 Meting API: ${METING_API_URL}`);
  console.log(`🎤 Cyapi (QQ/酷狗): ${isCyapiConfigured() ? '已配置' : '未配置'}`);
  console.log(`💾 房间存储: ${isRedisEnabled() ? 'Redis' : '内存'}`);
});
