import type { MusicSource, RoomAudioQuality } from '../../types';
import { useRoomStore } from '../../stores/roomStore';

export type NeteaseQuality = 'standard' | 'exhigh' | 'lossless' | 'higher' | 'hires' | '128' | '320' | 'flac';
export type TencentQuality = 'standard' | 'exhigh' | 'lossless' | '128' | '320' | 'flac';

export const DEFAULT_ROOM_AUDIO_QUALITY: RoomAudioQuality = {
  netease: 'hires',
  tencent: 'lossless',
};

export interface QualityOption {
  value: string;
  label: string;
}

export const NETEASE_QUALITY_OPTIONS: QualityOption[] = [
  { value: 'standard', label: '标准 ~128k' },
  { value: 'higher', label: '较高 ~192k' },
  { value: 'exhigh', label: '极高 ~320k' },
  { value: 'lossless', label: '无损 FLAC' },
  { value: 'hires', label: 'Hi-Res' },
];

export const TENCENT_QUALITY_OPTIONS: QualityOption[] = [
  { value: 'standard', label: '标准 ~128k' },
  { value: 'exhigh', label: '极高 ~320k' },
  { value: 'lossless', label: '无损 FLAC' },
];

const NETEASE_CANONICAL = new Set(NETEASE_QUALITY_OPTIONS.map((o) => o.value));
const TENCENT_CANONICAL = new Set(TENCENT_QUALITY_OPTIONS.map((o) => o.value));

/** API 别名 → 房间存储用的 canonical 值 */
const QUALITY_ALIASES: Record<string, string> = {
  '128': 'standard',
  '320': 'exhigh',
  flac: 'lossless',
};

const QUALITY_LABEL_MAP = new Map<string, string>();
for (const opt of [...NETEASE_QUALITY_OPTIONS, ...TENCENT_QUALITY_OPTIONS]) {
  if (!QUALITY_LABEL_MAP.has(opt.value)) {
    QUALITY_LABEL_MAP.set(opt.value, opt.label);
  }
}

export function getQualityLabel(quality: string | undefined): string {
  if (!quality) return '默认';
  return QUALITY_LABEL_MAP.get(quality) || quality;
}

export function normalizeRoomAudioQuality(
  input: RoomAudioQuality | Partial<RoomAudioQuality> | null | undefined,
): RoomAudioQuality {
  const rawNetease = String(input?.netease || DEFAULT_ROOM_AUDIO_QUALITY.netease);
  const rawTencent = String(input?.tencent || DEFAULT_ROOM_AUDIO_QUALITY.tencent);
  const netease = QUALITY_ALIASES[rawNetease] || rawNetease;
  const tencent = QUALITY_ALIASES[rawTencent] || rawTencent;
  return {
    netease: NETEASE_CANONICAL.has(netease) ? netease : 'lossless',
    tencent: TENCENT_CANONICAL.has(tencent) ? tencent : 'lossless',
  };
}

export function getRoomPlaybackQuality(source: MusicSource): string | undefined {
  const room = useRoomStore.getState().room;
  const quality = normalizeRoomAudioQuality(room?.audioQuality);
  if (source === 'netease') return quality.netease;
  if (source === 'tencent') return quality.tencent;
  return undefined;
}
