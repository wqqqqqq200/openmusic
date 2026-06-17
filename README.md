# OpenMusic

多人实时在线点歌系统。支持 **网易云 / QQ音乐 / 酷狗** 三平台搜索点歌，房间内播放队列、进度、歌词多端同步。

**在线体验**：[http://m.qqovo.cn/](http://m.qqovo.cn/)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green)](https://nodejs.org/)

---

## 目录

- [生产部署](#生产部署)
- [环境变量](#环境变量)
- [快速开始（开发）](#快速开始开发)
- [功能特性](#功能特性)
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

2. **迟言 API Key**（可选，QQ 搜索 + 酷狗）

在 [迟言 API](https://cyapi.top/) 注册获取 `apikey`。不配置时仅网易可用。

### 方式一：Node 直接托管

```bash
git clone https://github.com/你的用户名/openmusic.git
cd openmusic

npm run install:all
npm run build          # 构建前端 → client/dist

cp server/.env.example server/.env
# 编辑 server/.env，至少配置 METING_API_URL 和 METING_API_AUTH

npm start              # 默认 http://服务器IP:4000
```

### 方式二：宝塔 / PM2

```bash
npm run package:baota  # 生成 release/openmusic-baota.zip
```

详细步骤见 [deploy/DEPLOY-BAOTA.md](deploy/DEPLOY-BAOTA.md)。

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
| `CYAPI_KEY` | 可选 | 迟言 `apikey`；QQ 搜索 + 酷狗 |

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

---

## 快速开始（开发）

**要求**：Node.js >= 18

```bash
git clone https://github.com/你的用户名/openmusic.git
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

打开前端 → 输入昵称 → 创建/加入房间 → 搜索点歌。**房主设备**负责实际播控，其他听众跟随同步。电视大屏：`/tv/房间号`。

---

## 功能特性

- **多平台搜索**：网易 / QQ / 酷狗并行搜索，结果交替展示
- **播放队列**：点歌入队、插队申请、切歌申请（房主审批）
- **多端同步**：播放 / 暂停 / 进度 / 歌词全房间实时同步
- **房间社交**：在线用户列表、文字聊天、房间分享
- **电视模式**：`/tv/:roomId` 大屏展示封面与歌词（只读）

---

## 免责声明

本项目仅供学习与技术交流使用。音乐版权归属各平台及权利人所有，请遵守相关法律法规，**不得用于商业用途**。

---

## License

[MIT](LICENSE)
