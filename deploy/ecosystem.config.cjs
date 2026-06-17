/** PM2 配置 — SSH: cd /www/openmusic && pm2 start deploy/ecosystem.config.cjs */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'openmusic',
      cwd: path.join(__dirname, '../server'),
      script: 'index.js',      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
