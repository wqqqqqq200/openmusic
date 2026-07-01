import { useEffect } from 'react';

export const SITE_NAME = 'OpenMusic';

export const DEFAULT_TITLE = '一起听歌 · 多人实时点歌 - OpenMusic';
export const DEFAULT_DESCRIPTION =
  '和好友一起听歌、多人同步播放的在线点歌房间。支持网易云、QQ 音乐、酷狗搜索点歌，歌词同步滚动、实时聊天；创建房间即可与小伙伴多人一起听歌。';
export const DEFAULT_KEYWORDS =
  '一起听歌,多人听歌,一起听歌房间,多人一起听歌,同步听歌,好友一起听歌,在线一起听歌,多人点歌,在线点歌,点歌房,同步播放,网易云,QQ音乐,酷狗,歌词同步,OpenMusic';

export interface PageSeoOptions {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
}

/** 使用浏览器当前访问域名（canonical、OG 等） */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return '';
}

function upsertMeta(name: string, content: string, attribute: 'name' | 'property' = 'name') {
  let el = document.head.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(origin: string) {
  const id = 'openmusic-json-ld';
  let el = document.getElementById(id) as HTMLScriptElement | null;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    alternateName: ['一起听歌', '多人听歌', '在线点歌房'],
    description: DEFAULT_DESCRIPTION,
    ...(origin ? { url: `${origin}/` } : {}),
    applicationCategory: 'MusicApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    inLanguage: 'zh-CN',
    featureList: [
      '和好友一起听歌，多人房间实时同步播放',
      '网易云、QQ 音乐、酷狗多平台搜索点歌',
      '歌词同步滚动，边听边聊',
      '创建房间即可邀请小伙伴多人一起听歌',
    ],
  };

  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function buildPageTitle(pageTitle?: string) {
  if (!pageTitle) return DEFAULT_TITLE;
  if (pageTitle.includes(SITE_NAME)) return pageTitle;
  return `${pageTitle} - ${SITE_NAME}`;
}

export function applyPageSeo(options: PageSeoOptions = {}) {
  if (typeof document === 'undefined') return;

  const title = buildPageTitle(options.title);
  const description = options.description || DEFAULT_DESCRIPTION;
  const origin = getSiteOrigin();
  const path = options.path ?? window.location.pathname;
  const url = origin ? `${origin}${path}` : path;
  const image = options.image || (origin ? `${origin}/og-cover.png` : '/og-cover.png');
  const robots = options.noindex ? 'noindex, nofollow' : 'index, follow';

  document.title = title;
  upsertMeta('description', description);
  upsertMeta('keywords', DEFAULT_KEYWORDS);
  upsertMeta('robots', robots);

  if (origin) {
    upsertLink('canonical', url);
    upsertJsonLd(origin);
  }

  upsertMeta('og:title', title, 'property');
  upsertMeta('og:description', description, 'property');
  if (origin) upsertMeta('og:url', url, 'property');
  upsertMeta('og:image', image, 'property');
  upsertMeta('og:type', 'website', 'property');
  upsertMeta('og:locale', 'zh_CN', 'property');
  upsertMeta('og:site_name', SITE_NAME, 'property');

  upsertMeta('twitter:card', 'summary_large_image');
  upsertMeta('twitter:title', title);
  upsertMeta('twitter:description', description);
  upsertMeta('twitter:image', image);
}

export function usePageSeo(options: PageSeoOptions) {
  const { title, description, path, image, noindex } = options;

  useEffect(() => {
    applyPageSeo({ title, description, path, image, noindex });
    return () => applyPageSeo();
  }, [title, description, path, image, noindex]);
}
