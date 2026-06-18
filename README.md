# OpenMusic

多人实时在线点歌系统。支持 **网易云 / QQ音乐 / 酷狗** 三平台搜索点歌，房间内播放队列、进度、歌词多端同步。

**在线体验**：[http://m.qqovo.cn/](http://m.qqovo.cn/)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green)](https://nodejs.org/)

<p align="center">
  <img src="docs/screenshots/home.png" alt="房间大厅" width="100%" />
  <br /><br />
  <img src="docs/screenshots/room.png" alt="房间内点歌" width="100%" />
  <br /><br />
  <img src="docs/screenshots/lyrics.png" alt="歌词播放界面" width="100%" />
</p>

---

## 目录

- [生产部署](#生产部署)
- [环境变量](#环境变量)
- [快速开始（开发）](#快速开始开发)
- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [免责声明](#免责声明)

---

## 生产部署

### 前置依赖

1. **Meting-API**（必填，网易云 + QQ 播放）

```bash
docker pull ghcr.io/mikus-loli/meting-api:latest
docker run -d --name meting -p 3000:3000 ghcr.io/mikus-loli/meting-api:latest
```

建议在 Meting 管理后台 (`/admin`，默认 `admin` / `admin123`) 配置网易云 Cookie。

2. **迟言 API Key**（可选，QQ 搜索 + 酷狗 + 队列为空随机推荐）

在 [迟言 API](https://cyapi.top/) 注册获取 `apikey`。不配置时仅网易可用；队列为空时也无法自动随机播歌（需手动点歌或配置迟言）。

### 方式一：Node 直接托管

```bash
git clone https://github.com/你的用户名/openmusic.git
cd openmusic

npm run install:all
npm run build          # 构建前端 → client/dist
# 或 npm run package:build  # 一键打包部署目录 + release/openmusic-build.zip

cp server/.env.example server/.env
# 编辑 server/.env，至少配置 METING_API_URL 和 METING_API_AUTH

npm start              # 默认 http://服务器IP:4000
```

### 方式二：宝塔 / PM2

```bash
npm run install:all
npm run build          # 构建前端 → client/dist
# 或 npm run package:build
```

在 `server/`、`client/dist/`、`deploy/` 上传到服务器前，**生产环境建议配置 Redis**，避免发版重启后房间全部丢失。详细步骤见 [deploy/DEPLOY-BAOTA.md](deploy/DEPLOY-BAOTA.md)。

### 打包命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 仅构建前端，产物在 `client/dist` |
| `npm run package:build` | 构建前端并组装 `release/openmusic/`，输出 `release/openmusic-build.zip` |

### Nginx 反向代理

**必须**为 `/socket.io` 配置 WebSocket 升级，否则实时同步失效：

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

完整示例：[deploy/nginx.conf.example](deploy/nginx.conf.example)

---

## 环境变量

在 `server/.env` 中配置（参考 `server/.env.example`）：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `PORT` | | 服务端口，默认 `4000` |
| `CLIENT_URL` | | 前端地址（CORS），如 `https://your-domain.com` |
| `METING_API_URL` | ✅ | Meting-API 地址，如 `http://127.0.0.1:3000` |
| `METING_API_AUTH` | 推荐 | Meting 的 `auth` 令牌 |
| `CYAPI_BASE` | | 迟言 API 根地址，默认 `https://cyapi.top/API` |
| `CYAPI_KEY` | 可选 | 迟言 `apikey`；QQ 搜索、酷狗、队列为空随机推荐 |
| `VMY_LRC_URL` | | 歌词备用接口（按歌名），默认 `https://api.52vmy.cn/api/music/lrc` |
| `REDIS_URL` | 可选 | Redis 连接串，如 `redis://127.0.0.1:6379/0`；与下方分项配置二选一 |
| `REDIS_HOST` | 可选 | Redis 地址；配置 `REDIS_URL` 或 `REDIS_HOST` 之一即启用持久化 |
| `REDIS_PORT` | | 端口，默认 `6379` |
| `REDIS_USERNAME` | | 用户名，无则留空 |
| `REDIS_PASSWORD` | | 密码，无则留空 |
| `REDIS_DB` | | 数据库编号，默认 `0` |

**最小配置（仅网易云）：**

```env
PORT=4000
METING_API_URL=http://127.0.0.1:3000
METING_API_AUTH=你的meting_token
```

**三平台完整配置：**

```env
PORT=4000
CLIENT_URL=https://your-domain.com
METING_API_URL=http://127.0.0.1:3000
METING_API_AUTH=你的meting_token
CYAPI_BASE=https://cyapi.top/API
CYAPI_KEY=你的迟言apikey
```

**生产环境推荐（房间持久化）：**

方式一 — 连接串（无账号密码时）：

```env
REDIS_URL=redis://127.0.0.1:6379/0
```

方式二 — 分项配置（账号密码没有就不填）：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
# REDIS_USERNAME=你的用户名
# REDIS_PASSWORD=你的密码
```

配置后，房间歌单、播放进度、密码等会在 Redis 中持久化，服务更新或重启后可自动恢复。未配置 Redis 时行为与原来一致，仅使用内存存储。

### 房间 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rooms` | 获取所有房间摘要（人数、正在播放、是否有密码等） |
| `POST` | `/api/rooms` | 创建房间，请求体可含 `{ "name": "房间名称", "password": "可选密码" }` |
| `GET` | `/api/rooms/:id` | 检查房间是否存在；密码房仅返回摘要，不泄露歌单 |

加入房间时通过 Socket `join_room` 传入 `password` 字段校验。

`GET /api/health` 返回服务状态，例如：

```json
{ "ok": true, "metingApi": "http://127.0.0.1:3000", "cyapi": true, "redis": false }
```

`cyapi` 表示迟言 API 是否已配置；`redis` 表示是否启用房间持久化。

---

## 快速开始（开发）

**要求**：Node.js >= 18

```bash
git clone https://github.com/wqqqqqq200/openmusic.git
cd openmusic

npm run install:all
cp server/.env.example server/.env
# 配置 METING_API_URL

npm run dev
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:4000 |

打开前端 → 输入昵称（留空则自动生成）→ 在大厅创建/加入房间 → 搜索点歌。**房主设备**负责实际播控，其他听众跟随同步。电视大屏：`/tv/房间号`。

- 昵称会保存在浏览器本地；未填写时自动从预置词库随机生成（如 `摸鱼听碟42`）
- 首页展示所有在线房间，每 5 秒自动刷新；可自定义房间名称，创建时可设可选密码
- 房间内可一键复制分享链接或电视投屏地址

---

## 功能特性

- **多平台搜索**：网易 / QQ / 酷狗并行搜索，结果交替展示；支持开启「跨平台去重」（歌名 + 歌手相同视为同一首，优先保留网易源）
- **房间大厅**：首页展示所有活跃房间（人数、正在播放、队列长度），点击即可加入，列表自动刷新
- **房间命名与密码**：创建时可自定义房间名称；可选密码防止陌生人进入
- **随机昵称**：未填写昵称时自动生成（预置前缀 + 两位数字，如 `吗喽本喽07`），昵称保存在本地
- **房间持久化**：可选 Redis 存储，服务重启后保留歌单、播放进度与房间密码（配置 `REDIS_URL` 或 `REDIS_HOST` 等）
- **播放队列**：点歌入队、插队申请、切歌申请（房主审批）
- **随机推荐**：队列为空时自动播放网易云热评随机曲（迟言 `wyrp.php`），同房间不重复随机，并后台预取下一首
- **智能时长**：接口元数据 → 音频文件时长 → 歌词末行 + 20 秒；播放到有效时长自动切歌，进度不超过歌曲长度
- **预加载**：房主端预解析下一首播放地址，队列前几首提前缓冲
- **多端同步**：播放 / 暂停 / 进度 / 歌词全房间实时同步
- **房间社交**：在线用户列表、文字聊天、房间分享与电视投屏链接
- **电视模式**：`/tv/:roomId` 大屏展示封面与歌词（只读）

---

## 项目结构

```
openmusic/
├── client/          # React + Vite 前端
│   └── src/
│       ├── api/     # 音乐搜索、房间 REST 接口
│       ├── pages/   # 首页大厅、房间页、电视模式
│       └── lib/     # 工具（含随机昵称词库 randomNickname.ts）
├── server/          # Express + Socket.IO 后端
│   ├── index.js     # HTTP 代理、房间 API、WebSocket 事件
│   ├── roomManager.js   # 房间状态、队列、播放逻辑
│   └── roomStorage.js   # Redis 持久化（可选）
└── deploy/          # Nginx、PM2、宝塔部署示例
```

---

## 免责声明

本项目仅供学习与技术交流使用。音乐版权归属各平台及权利人所有，请遵守相关法律法规，**不得用于商业用途**。

---

## License

[MIT](LICENSE)
