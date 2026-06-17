import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRoom,
  getRoom,
  roomExists,
  addUser,
  removeUser,
  addToQueue,
  removeFromQueue,
  skipSong,
  ensurePlayback,
  setPlaying,
  seekTo,
  getRoomInternal,
  requestJump,
  approveJump,
  rejectJump,
  requestSkip,
  approveSkip,
  rejectSkip,
  addChatMessage,
} from './roomManager.js';
import {
  isCyapiConfigured,
  searchQqMusic,
  searchKugouMusic,
  getKugouSongDetail,
} from './cyapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const METING_API_URL = (process.env.METING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const METING_API_AUTH = process.env.METING_API_AUTH || '';
const VMY_LRC_URL = (process.env.VMY_LRC_URL || 'https://api.52vmy.cn/api/music/lrc').replace(/\/$/, '');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: true }));
app.use(express.json());

function buildMetingUrl(query) {
  const params = new URLSearchParams(query);
  if (METING_API_AUTH && !params.has('auth')) {
    params.set('auth', METING_API_AUTH);
  }
  return `${METING_API_URL}/api?${params.toString()}`;
}

async function proxyMetingResponse(targetUrl, res) {
  const response = await fetch(targetUrl, { redirect: 'manual' });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
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
  res.json({
    ok: true,
    metingApi: METING_API_URL,
    cyapi: isCyapiConfigured(),
  });
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
      supportsSearch: isCyapiConfigured(),
      supportsIdLookup: false,
      description: isCyapiConfigured() ? '通过迟言 API 搜索' : '请配置 CYAPI_KEY',
    },
    {
      id: 'kugou',
      name: '酷狗音乐',
      shortName: '酷狗',
      color: '#2688ee',
      supportsSearch: isCyapiConfigured(),
      supportsIdLookup: false,
      description: isCyapiConfigured() ? '通过迟言 API 搜索' : '请配置 CYAPI_KEY',
    },
  ];
  res.json(sources);
});

app.get('/api/meting', async (req, res) => {
  try {
    await proxyMetingResponse(buildMetingUrl(req.query), res);
  } catch (err) {
    console.error('Meting proxy error:', err.message);
    res.status(502).json({ error: '无法连接 Meting API，请检查 METING_API_URL 配置' });
  }
});

/** cyapi QQ 音乐搜索 */
app.get('/api/music/cyapi/search', async (req, res) => {
  if (!isCyapiConfigured()) {
    return res.status(503).json({ error: '未配置 CYAPI_KEY' });
  }

  const keyword = String(req.query.q || '').trim();
  const num = Math.min(Math.max(parseInt(String(req.query.num || '15'), 10) || 15, 1), 30);

  if (!keyword) return res.json([]);

  try {
    res.json(await searchQqMusic(keyword, num));
  } catch (err) {
    console.error('Cyapi QQ search error:', err.message);
    res.status(502).json({ error: 'QQ音乐搜索失败' });
  }
});

/** cyapi 酷狗音乐搜索 */
app.get('/api/music/cyapi/kugou/search', async (req, res) => {
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

/** cyapi 酷狗音乐详情（播放链接、歌词） */
app.get('/api/music/cyapi/kugou/song', async (req, res) => {
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
  const msg = String(req.query.msg || '').trim();
  const n = String(req.query.n || '1');
  if (!msg) return res.status(400).json({ error: '缺少歌曲名' });

  try {
    const params = new URLSearchParams({ msg, n });
    const response = await fetch(`${VMY_LRC_URL}?${params}`);
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

app.post('/api/rooms', (_req, res) => {
  const room = createRoom();
  res.json(room);
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  res.json(room);
});

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const socketToRoom = new Map();

io.on('connection', (socket) => {
  socket.on('join_room', async ({ roomId, nickname }, callback) => {
    const id = roomId?.toUpperCase();
    if (!roomExists(id)) {
      callback?.({ success: false, error: '房间不存在' });
      return;
    }

    addUser(id, socket.id, nickname);
    const room = await ensurePlayback(id);
    socket.join(id);
    socketToRoom.set(socket.id, id);

    io.to(id).emit('room_update', room);
    callback?.({
      success: true,
      room,
      socketId: socket.id,
      isOwner: room.ownerId === socket.id,
    });
  });

  socket.on('add_song', async ({ song }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const room = getRoomInternal(roomId);
    const user = room?.users.get(socket.id);
    const result = await addToQueue(roomId, song, user?.nickname || '匿名');
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('remove_song', ({ queueId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = removeFromQueue(roomId, socket.id, queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('skip_song', async (_payload, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await skipSong(roomId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('request_jump', ({ queueId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = requestJump(roomId, socket.id, queueId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('approve_jump', async ({ requestId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveJump(roomId, socket.id, requestId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('reject_jump', ({ requestId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectJump(roomId, socket.id, requestId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('request_skip', (_payload, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = requestSkip(roomId, socket.id);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('approve_skip', async ({ requestId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = await approveSkip(roomId, socket.id, requestId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('reject_skip', ({ requestId }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = rejectSkip(roomId, socket.id, requestId);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, room: result.room });
  });

  socket.on('send_chat', ({ text }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const result = addChatMessage(roomId, socket.id, text);
    if (result.error) {
      callback?.({ success: false, error: result.error });
      return;
    }

    io.to(roomId).emit('chat_message', result.message);
    io.to(roomId).emit('room_update', result.room);
    callback?.({ success: true, message: result.message });
  });

  socket.on('toggle_play', ({ isPlaying }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = setPlaying(roomId, isPlaying);
    io.to(roomId).emit('room_update', updated);
    callback?.({ success: true, room: updated });
  });

  socket.on('seek', ({ time }, callback) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      callback?.({ success: false, error: '未加入房间' });
      return;
    }

    const updated = seekTo(roomId, socket.id, time);
    if (!updated) {
      callback?.({ success: false, error: '仅房主可调节进度' });
      return;
    }
    io.to(roomId).emit('room_update', updated);
    callback?.({ success: true, room: updated });
  });

  socket.on('sync_time', ({ time }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const room = getRoomInternal(roomId);
    if (!room || !room.isPlaying) return;

    room.startedAt = Date.now() - time * 1000;
    room.currentTime = time;
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const result = removeUser(roomId, socket.id);
    socketToRoom.delete(socket.id);

    if (result?.deleted) return;
    io.to(roomId).emit('room_update', result);
  });
});

setInterval(() => {
  for (const [roomId] of io.sockets.adapter.rooms) {
    if (roomId.length !== 6) continue;
    const internal = getRoomInternal(roomId);
    if (!internal?.isPlaying || !internal.current) continue;

    const state = {
      currentTime: internal.startedAt
        ? (Date.now() - internal.startedAt) / 1000
        : internal.currentTime,
      isPlaying: true,
    };

    io.to(roomId).emit('playback_tick', state);
  }
}, 1000);

httpServer.listen(PORT, () => {
  console.log(`🎵 OpenMusic 服务运行在 http://localhost:${PORT}`);
  console.log(`📡 Meting API: ${METING_API_URL}`);
  console.log(`🎤 Cyapi (QQ/酷狗): ${isCyapiConfigured() ? '已配置' : '未配置'}`);
});
