# 宝塔面板部署指南

## 一、本地打包

在项目根目录执行：

```bash
npm run install:all   # 首次需要
npm run package:baota
```

生成文件：

- `release/openmusic/` — 部署目录
- `release/openmusic-baota.zip` — 可直接上传宝塔的压缩包

压缩包内含：后端代码、`client/dist` 前端静态文件、PM2 与 Nginx 配置示例。

---

## 二、上传到服务器

1. 宝塔 → **文件** → 上传到例如 `/www/wwwroot/openmusic`
2. 解压 `openmusic-baota.zip`

目录结构应为：

```
/www/wwwroot/openmusic/
├── server/          # Node 后端
├── client/dist/     # 前端（已构建）
└── deploy/          # PM2、Nginx 示例
```

---

## 三、安装 Node 依赖

宝塔 → **终端**（或 SSH）：

```bash
cd /www/wwwroot/openmusic/server
cp .env.example .env
nano .env   # 或用宝塔文件管理器编辑
npm install --production
```

### `.env` 必改项

```env
PORT=4000
CLIENT_URL=https://你的域名.com

METING_API_URL=http://你的meting地址:3000
METING_API_AUTH=你的token

CYAPI_KEY=你的QQ搜索key
```

> `CLIENT_URL` 填最终访问的 **https 域名**，不要带末尾斜杠。

---

## 四、用 PM2 启动

```bash
cd /www/wwwroot/openmusic
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # 按提示设置开机自启
```

或在宝塔 → **Node 项目 / PM2** 添加（二选一）：

**方式 A（推荐，最省事）**

| 项 | 填写 |
|----|------|
| 运行目录 | `/www/openmusic/server` |
| 启动文件 | `index.js` |
| 项目名称 | `openmusic` |
| 端口 | `4000` |

**方式 B（使用 PM2 配置文件）**

| 项 | 填写 |
|----|------|
| 运行目录 | `/www/openmusic/deploy` |
| 启动文件 | `ecosystem.config.cjs` |
| 项目名称 | `openmusic`（不要叫 deploy） |

> 方式 B 要求宝塔用 `pm2 start` 加载配置文件，而不是 `node` 直接执行。若启动报错，请改用方式 A。

或在宝塔 → **Node 项目** → 添加项目（方式 A）：

- 项目路径：`/www/wwwroot/openmusic/server`
- 启动文件：`index.js`
- 端口：`4000`（与 `.env` 一致）

---

## 五、Nginx 反向代理

宝塔 → **网站** → 添加站点（你的域名）→ **设置** → **配置文件**

参考 `deploy/nginx.conf.example`，将请求反代到 `127.0.0.1:4000`。

**必须配置 `/socket.io/` 的 WebSocket**，否则房间无法实时同步。

若使用 HTTPS，在宝塔申请 SSL 即可，反代地址仍用 `http://127.0.0.1:4000`。

---

## 六、验证

1. 浏览器打开 `https://你的域名.com`
2. 创建房间、搜索点歌
3. 电视投屏页：`https://你的域名.com/tv/房间号`

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 页面能开但无法加入房间 | 检查 Nginx 是否配置 `socket.io` WebSocket |
| 搜不到歌 / 无法播放 | 检查 `METING_API_URL`、`CYAPI_KEY` |
| 502 | PM2 是否运行：`pm2 list` |
| 端口冲突 | 修改 `.env` 的 `PORT` 和 Nginx 反代端口 |

---

## 更新部署

本地重新 `npm run package:baota`，上传覆盖 `server/` 和 `client/dist/`，然后：

```bash
cd /www/wwwroot/openmusic/server
npm install --production
pm2 restart openmusic
```
