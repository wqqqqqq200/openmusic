/** @param {import('express').Request} req */
export function resolveSiteOrigin(req, allowedOrigins) {
  if (allowedOrigins && allowedOrigins.size > 0) {
    return [...allowedOrigins][0];
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const proto = (forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol) || 'http';
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host')) || 'localhost';
  return `${proto}://${host}`.replace(/\/$/, '');
}

/** @param {import('http').IncomingMessage} req */
export function resolveDevSiteOrigin(req) {
  const host = req.headers.host || 'localhost:5173';
  return `http://${host}`.replace(/\/$/, '');
}

export function buildRobotsTxt(siteOrigin) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# 房间与电视模式为动态会话页，不参与收录',
    'Disallow: /room/',
    'Disallow: /tv/',
    '',
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(siteOrigin) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${siteOrigin}/</loc>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}
