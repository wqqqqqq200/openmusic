# OpenMusic

多人实时在线点歌系统。

支持网易云、QQ 音乐、酷狗搜索点歌，房间成员实时同步播放、歌词同步、聊天互动。

---

## ✨ 特性

* 🎵 多平台音乐搜索（网易云 / QQ / 酷狗）
* 👥 多人实时同步听歌
* 📜 歌词同步滚动
* 🏠 房间大厅与在线人数展示
* 🔐 房间密码保护
* 📋 歌单导入（网易云 / QQ）与推荐歌单、歌单渠道筛选
* 🔥 网易云热榜与全站点歌热榜
* ❤️ 个人收藏与点歌历史（支持 JSON 导入 / 导出）
* 📺 TV 大屏模式（`/tv/:roomId`）
* 💬 实时聊天、QQNT 表情、消息点评、回复 / @ 提及与 @全体成员
* 📷 聊天发图（七牛云 OSS，可选）
* 🎨 房间视觉背景（星河、唱片、封面等预设与参数调节）
* 🎚️ 自选音质
* 👑 成员等级、贵宾与管理员角色标识
* 📢 房间公告
* 📻 FM 模式与插队请求
* 🔗 房间分享（含邀请者与当前歌曲）
* 🕐 最近访问房间
* 🔄 Redis 持久化支持（可选）

---

## 📷 项目截图

### 房间大厅

![大厅](docs/screenshots/home.png)

### 房间点歌

![房间](docs/screenshots/room.png)

### 歌词播放

![歌词](docs/screenshots/lyrics.png)

---

## 🚀 快速部署

**要求**：Node.js >= 18

### Docker（Meting-API）

```bash
docker pull ghcr.io/mikus-loli/meting-api:latest
docker run -d --name meting -p 3000:3000 ghcr.io/mikus-loli/meting-api:latest
```

### 启动 OpenMusic

```bash
git clone https://github.com/qq01-hub/openmusic.git
cd openmusic

npm run install:all
cp server/.env.example server/.env
npm run build
npm start
```

生产环境由同一 Node 进程托管 API、WebSocket 与前端静态资源，默认监听 `http://0.0.0.0:4000`。

开发模式：

```bash
npm run dev
```

| 服务 | 地址 |
|------|------|
| 前端（Vite） | http://localhost:5173 |
| 后端 | http://localhost:4000 |

### 环境变量

```env
PORT=4000
CLIENT_URL=https://your-domain.com
CLIENT_ID_SECRET=your-secret
METING_API_URL=http://127.0.0.1:3000
```

完整配置见：[docs/DEPLOY.md](docs/DEPLOY.md)

### SEO 与 sitemap

前端已内置 `meta` / Open Graph / Twitter Card / JSON-LD，页面标签按**当前访问域名**自动写入；房间与 TV 页为 `noindex`。

`/sitemap.xml` 与 `/robots.txt` 由服务端动态生成，优先使用 `CLIENT_URL`，否则按请求域名推断，**无需额外配置**。

---

## 🛠 技术栈

### Frontend

* React
* Vite
* TailwindCSS
* Socket.IO Client
* Three.js / React Three Fiber（房间视觉背景）

### Backend

* Node.js
* Express
* Socket.IO
* Redis（可选）

---

## 📄 免责声明

本项目仅供学习与技术交流使用。

本项目不存储任何音频文件，音乐版权归相关权利人所有。

请遵守相关法律法规及平台服务协议，不得用于商业用途。

---

## License

MIT
