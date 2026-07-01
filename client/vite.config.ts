import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildRobotsTxt, buildSitemapXml, resolveDevSiteOrigin } from '../shared/seoFiles.mjs';

function seoDevMiddleware() {
  return {
    name: 'openmusic-seo-dev',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== '/sitemap.xml' && pathname !== '/robots.txt') {
          next();
          return;
        }

        const origin = resolveDevSiteOrigin(req);
        const body = pathname === '/robots.txt' ? buildRobotsTxt(origin) : buildSitemapXml(origin);
        res.setHeader('Content-Type', pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), seoDevMiddleware()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
