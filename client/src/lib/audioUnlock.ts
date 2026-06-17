export function isWeChatBrowser(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/** 配置 audio 以支持微信 / iOS 内联播放 */
export function configureInlineAudio(audio: HTMLAudioElement): void {
  audio.setAttribute('playsinline', 'true');
  audio.setAttribute('webkit-playsinline', 'true');
  audio.setAttribute('x5-playsinline', 'true');
  audio.setAttribute('x5-video-player-type', 'h5-page');
  audio.preload = 'auto';
}

type WeixinBridge = { invoke: (method: string, args: object, cb: () => void) => void };

/** 微信 iOS：Bridge 就绪后回调（常用于解锁媒体播放） */
export function onWeChatBridgeReady(callback: () => void): void {
  if (!isWeChatBrowser()) return;

  const w = window as Window & { WeixinJSBridge?: WeixinBridge };
  const run = () => w.WeixinJSBridge?.invoke('getNetworkType', {}, callback);

  if (typeof w.WeixinJSBridge !== 'undefined') {
    run();
  } else {
    document.addEventListener('WeixinJSBridgeReady', run, { once: true });
  }
}

export type PlayResult = 'played' | 'blocked' | 'error';

export function isTvPage(): boolean {
  return /^\/tv\//.test(window.location.pathname);
}

export async function tryPlay(audio: HTMLAudioElement): Promise<PlayResult> {
  try {
    await audio.play();
    return 'played';
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return 'blocked';
    }
    return 'error';
  }
}

/** 先正常播放，失败则尝试静音自动播放再取消静音（电视浏览器常用） */
export async function tryPlayWithAutoplayFallback(
  audio: HTMLAudioElement,
  allowMutedFallback: boolean,
): Promise<PlayResult> {
  const direct = await tryPlay(audio);
  if (direct === 'played' || !allowMutedFallback) return direct;

  const wasMuted = audio.muted;
  try {
    audio.muted = true;
    await audio.play();
    audio.muted = wasMuted;
    if (!audio.paused) return 'played';

    const retry = await tryPlay(audio);
    return retry;
  } catch {
    audio.muted = wasMuted;
    return 'blocked';
  }
}
