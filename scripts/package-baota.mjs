import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'release', 'openmusic');
const archivePath = path.join(root, 'release', 'openmusic-baota.zip');

const SERVER_FILES = [
  'index.js',
  'roomManager.js',
  'cyapi.js',
  'wqwlkjApi.js',
  'package.json',
  'package-lock.json',
  '.env.example',
];

function rm(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

console.log('>>> 构建前端...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('>>> 组装部署目录...');
rm(outDir);
fs.mkdirSync(path.join(outDir, 'server'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'client', 'dist'), { recursive: true });

for (const file of SERVER_FILES) {
  const src = path.join(root, 'server', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, 'server', file));
  }
}

copyDir(path.join(root, 'client', 'dist'), path.join(outDir, 'client', 'dist'));
copyDir(path.join(root, 'deploy'), path.join(outDir, 'deploy'));

fs.writeFileSync(
  path.join(outDir, 'README-DEPLOY.txt'),
  `OpenMusic 宝塔部署包

1. 上传本目录到服务器，例如 /www/wwwroot/openmusic
2. cd /www/wwwroot/openmusic/server
3. cp .env.example .env 并编辑配置（PORT、METING_API_URL、CLIENT_URL 填你的域名）
4. npm install --production
5. pm2 start ../deploy/ecosystem.config.cjs
6. 宝塔 Nginx 参考 deploy/nginx.conf.example 配置反向代理

详细说明见 deploy/DEPLOY-BAOTA.md
`,
  'utf8',
);

console.log('>>> 打包 zip...');
rm(archivePath);
fs.mkdirSync(path.dirname(archivePath), { recursive: true });

const ps = `Compress-Archive -Path '${outDir.replace(/'/g, "''")}\\*' -DestinationPath '${archivePath.replace(/'/g, "''")}' -Force`;
execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'inherit' });

console.log('');
console.log('✅ 打包完成');
console.log('   目录:', outDir);
console.log('   压缩包:', archivePath);
