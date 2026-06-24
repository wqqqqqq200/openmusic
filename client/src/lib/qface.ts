const QFACE_BASE_URL = 'https://koishi.js.org/QFace/';
const QFACE_INDEX_URL = `${QFACE_BASE_URL}assets/qq_emoji/_index.json`;
const QFACE_STORAGE_KEY = 'openmusic_qq_faces_v1';

export interface QFaceItem {
  id: string;
  text: string;
  url: string;
}

interface QFaceAsset {
  type: number;
  path: string;
}

interface QFaceIndexItem {
  emojiId: string;
  describe: string;
  isHide?: boolean;
  assets?: QFaceAsset[];
}

const POPULAR_QQ_FACES: QFaceItem[] = [
  { id: '0', text: '/惊讶', url: `${QFACE_BASE_URL}assets/qq_emoji/0/apng/0.png` },
  { id: '1', text: '/撇嘴', url: `${QFACE_BASE_URL}assets/qq_emoji/1/apng/1.png` },
  { id: '2', text: '/色', url: `${QFACE_BASE_URL}assets/qq_emoji/2/apng/2.png` },
  { id: '4', text: '/得意', url: `${QFACE_BASE_URL}assets/qq_emoji/4/apng/4.png` },
  { id: '5', text: '/流泪', url: `${QFACE_BASE_URL}assets/qq_emoji/5/apng/5.png` },
  { id: '9', text: '/大哭', url: `${QFACE_BASE_URL}assets/qq_emoji/9/apng/9.png` },
  { id: '13', text: '/呲牙', url: `${QFACE_BASE_URL}assets/qq_emoji/13/apng/13.png` },
  { id: '14', text: '/微笑', url: `${QFACE_BASE_URL}assets/qq_emoji/14/apng/14.png` },
  { id: '21', text: '/偷笑', url: `${QFACE_BASE_URL}assets/qq_emoji/21/apng/21.png` },
  { id: '23', text: '/酷', url: `${QFACE_BASE_URL}assets/qq_emoji/23/apng/23.png` },
  { id: '27', text: '/奋斗', url: `${QFACE_BASE_URL}assets/qq_emoji/27/apng/27.png` },
  { id: '63', text: '/玫瑰', url: `${QFACE_BASE_URL}assets/qq_emoji/63/apng/63.png` },
];

const QQ_FACE_TOKEN_RE = /\[qqface:([^\]]+)\]/g;
const LOAD_RETRY_DELAYS_MS = [0, 1500, 5000];
const BACKGROUND_RETRY_MS = 30000;
const FETCH_TIMEOUT_MS = 15000;

const preloadedImageUrls = new Set<string>();
const faceSubscribers = new Set<(faces: QFaceItem[]) => void>();

let fullFacesCache: QFaceItem[] | null = null;
let pendingFaces: Promise<QFaceItem[]> | null = null;
let backgroundRetryTimer: ReturnType<typeof setInterval> | null = null;
let hydratePromise: Promise<void> | null = null;

function readStoredFaces(): QFaceItem[] | null {
  try {
    const raw = localStorage.getItem(QFACE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as QFaceItem[];
    if (!Array.isArray(data) || data.length <= POPULAR_QQ_FACES.length) return null;
    return data.filter((face) => face?.id && face?.text && face?.url);
  } catch {
    return null;
  }
}

function writeStoredFaces(faces: QFaceItem[]): void {
  const persist = () => {
    try {
      localStorage.setItem(QFACE_STORAGE_KEY, JSON.stringify(faces));
    } catch {
      // localStorage may be unavailable or quota exceeded.
    }
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(persist, { timeout: 3000 });
  } else {
    setTimeout(persist, 0);
  }
}

function runWhenIdle(task: () => void): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, QFACE_BASE_URL).toString();
}

function toQFaceItem(item: QFaceIndexItem): QFaceItem | null {
  if (item.isHide) return null;

  const asset = item.assets?.find((entry) => entry.type === 2)
    || item.assets?.find((entry) => entry.type === 0)
    || item.assets?.[0];
  if (!item.emojiId || !item.describe || !asset?.path) return null;

  return {
    id: item.emojiId,
    text: item.describe,
    url: toAbsoluteUrl(asset.path),
  };
}

function getDisplayFaces(): QFaceItem[] {
  return fullFacesCache || POPULAR_QQ_FACES;
}

function notifyFaceSubscribers(): void {
  const faces = getDisplayFaces();
  faceSubscribers.forEach((callback) => callback(faces));
}

function stopBackgroundRetry(): void {
  if (backgroundRetryTimer === null) return;
  clearInterval(backgroundRetryTimer);
  backgroundRetryTimer = null;
}

function startBackgroundRetry(): void {
  if (backgroundRetryTimer !== null || fullFacesCache) return;

  backgroundRetryTimer = setInterval(() => {
    if (fullFacesCache) {
      stopBackgroundRetry();
      return;
    }
    void fetchAndCacheFaces().catch(() => {});
  }, BACKGROUND_RETRY_MS);
}

async function fetchQQFaceIndex(): Promise<QFaceItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(QFACE_INDEX_URL, { signal: controller.signal });
    if (!res.ok) throw new Error('QFace index failed');
    const data = (await res.json()) as QFaceIndexItem[];
    const faces = data.map(toQFaceItem).filter((face): face is QFaceItem => Boolean(face));
    if (faces.length <= POPULAR_QQ_FACES.length) throw new Error('QFace index incomplete');
    return faces;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAndCacheFaces(): Promise<QFaceItem[]> {
  const faces = await fetchQQFaceIndex();
  fullFacesCache = faces;
  writeStoredFaces(faces);
  notifyFaceSubscribers();
  stopBackgroundRetry();
  return faces;
}

function hydrateStoredFaces(): Promise<void> {
  if (fullFacesCache) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = new Promise((resolve) => {
    runWhenIdle(() => {
      const stored = readStoredFaces();
      if (!stored || fullFacesCache) {
        resolve();
        return;
      }
      fullFacesCache = stored;
      notifyFaceSubscribers();
      resolve();
    });
  });

  return hydratePromise;
}

async function loadWithRetries(): Promise<QFaceItem[]> {
  let lastError: unknown;

  for (const delay of LOAD_RETRY_DELAYS_MS) {
    if (fullFacesCache) return fullFacesCache;
    if (delay > 0) await sleep(delay);
    try {
      return await fetchAndCacheFaces();
    } catch (error) {
      lastError = error;
    }
  }

  startBackgroundRetry();
  throw lastError;
}

export function qqFaceToken(id: string): string {
  return `[qqface:${id}]`;
}

export function hasFullQQFaces(): boolean {
  return fullFacesCache !== null;
}

export function getInitialQQFaces(): QFaceItem[] {
  return getDisplayFaces();
}

export function subscribeQQFaces(callback: (faces: QFaceItem[]) => void): () => void {
  faceSubscribers.add(callback);
  callback(getDisplayFaces());
  return () => faceSubscribers.delete(callback);
}

export function preloadQQFaceImages(faces: QFaceItem[]): void {
  if (typeof Image === 'undefined') return;

  faces.forEach((face) => {
    if (preloadedImageUrls.has(face.url)) return;
    preloadedImageUrls.add(face.url);

    const image = new Image();
    image.decoding = 'async';
    image.src = face.url;
  });
}

export function parseQQFaceTokens(text: string): Array<string | { type: 'qqface'; id: string }> {
  const parts: Array<string | { type: 'qqface'; id: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(QQ_FACE_TOKEN_RE)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ type: 'qqface', id: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

export async function loadQQFaces(): Promise<QFaceItem[]> {
  if (fullFacesCache) return fullFacesCache;
  if (pendingFaces) return pendingFaces;

  pendingFaces = loadWithRetries()
    .catch(() => getDisplayFaces())
    .finally(() => {
      pendingFaces = null;
    });

  return pendingFaces;
}

export function ensureQQFacesLoaded(): void {
  void hydrateStoredFaces().then(() => {
    if (fullFacesCache) return;
    void loadQQFaces();
  });
}

export function initQQFaces(): void {
  preloadQQFaceImages(POPULAR_QQ_FACES);
  void hydrateStoredFaces();
}
