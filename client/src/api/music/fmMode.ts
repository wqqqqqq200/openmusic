export const DEFAULT_FM_MODE = 'DEFAULT';

export interface FmModeOption {
  value: string;
  label: string;
  description?: string;
}

export const NETEASE_FM_MODE_OPTIONS: FmModeOption[] = [
  { value: 'DEFAULT', label: '默认漫游', description: '综合听歌记录，常规个性化推荐' },
  { value: 'FAMILIAR', label: '熟悉模式', description: '多推收藏、常听与相似曲风' },
  { value: 'EXPLORE', label: '探索模式', description: '多推新歌、冷门歌，拓展曲库' },
  { value: 'SCENE_RCMD:EXERCISE', label: '运动场景', description: '节奏明快，适合锻炼' },
  { value: 'SCENE_RCMD:FOCUS', label: '专注场景', description: '适合工作、学习，偏轻音乐' },
  { value: 'SCENE_RCMD:NIGHT_EMO', label: '深夜场景', description: '夜晚情绪向慢歌' },
  { value: 'aidj', label: 'AI DJ', description: 'AI 串烧混剪，曲间带过渡衔接' },
];

const FM_MODE_VALUES = new Set(NETEASE_FM_MODE_OPTIONS.map((o) => o.value));

const FM_MODE_LABEL_MAP = new Map(NETEASE_FM_MODE_OPTIONS.map((o) => [o.value, o.label]));

export function normalizeFmMode(input: string | null | undefined): string {
  const raw = String(input || '').trim();
  if (!raw) return DEFAULT_FM_MODE;
  if (FM_MODE_VALUES.has(raw)) return raw;
  return DEFAULT_FM_MODE;
}

export function getFmModeLabel(mode: string | null | undefined): string {
  const normalized = normalizeFmMode(mode);
  return FM_MODE_LABEL_MAP.get(normalized) || normalized;
}
