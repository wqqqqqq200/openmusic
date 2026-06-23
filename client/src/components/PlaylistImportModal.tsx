import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ChevronLeft, Clock, Trash2 } from 'lucide-react';
import type { PlaylistPlatform } from '../api/music/playlist';

const HINTS: Record<PlaylistPlatform, string> = {
  netease: '复制网易云歌单分享文案或链接粘贴到下方。',
  qq: '点击 QQ 音乐歌单「分享」→ 打开 QQ → 选择「我的电脑」发送，将链接粘贴到下方。',
};

const PLATFORM_LABELS: Record<PlaylistPlatform, string> = {
  netease: '网易云音乐',
  qq: 'QQ音乐',
};

const TITLES: Record<PlaylistPlatform, string> = {
  netease: '导入网易云歌单',
  qq: '导入 QQ 音乐歌单',
};

const HISTORY_KEY = 'openmusic:playlist-import-history';
const MAX_HISTORY = 10;

type HistoryItem = {
  id: string;
  platform: PlaylistPlatform;
  playlistId: string;
  name: string;
  updatedAt: number;
};

interface Props {
  open: boolean;
  loading?: boolean;
  qqImportEnabled?: boolean;
  onClose: () => void;
  onImport: (platform: PlaylistPlatform, input: string) => void;
}

function normalizeHistoryItem(item: unknown): HistoryItem | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Partial<HistoryItem> & { input?: string; title?: string };
  if (raw.platform !== 'netease' && raw.platform !== 'qq') return null;
  const playlistId = String(raw.playlistId || '').trim();
  const name = String(raw.name || '').trim();
  if (!playlistId || !name) return null;
  return {
    id: `${raw.platform}:${playlistId}`,
    platform: raw.platform,
    playlistId,
    name,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.map(normalizeHistoryItem).filter(Boolean).slice(0, MAX_HISTORY) as HistoryItem[] : [];
  } catch {
    return [];
  }
}

function writeHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage may be unavailable.
  }
}

export function rememberPlaylistImportHistory(item: {
  platform: PlaylistPlatform;
  playlistId: string;
  name: string;
}): HistoryItem[] {
  const playlistId = item.playlistId.trim();
  const name = item.name.trim() || '未命名歌单';
  if (!playlistId) return readHistory();

  const id = `${item.platform}:${playlistId}`;
  const next = [
    { id, platform: item.platform, playlistId, name, updatedAt: Date.now() },
    ...readHistory().filter((historyItem) => historyItem.id !== id),
  ];
  writeHistory(next);
  return next.slice(0, MAX_HISTORY);
}

export default function PlaylistImportModal({
  open,
  loading = false,
  qqImportEnabled = true,
  onClose,
  onImport,
}: Props) {
  const [platform, setPlatform] = useState<PlaylistPlatform | null>(null);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>(() => readHistory());

  useEffect(() => {
    if (open) setHistory(readHistory());
    if (!open) {
      setPlatform(null);
      setInput('');
    }
  }, [open]);

  const visibleHistory = useMemo(() => {
    return history.filter((item) => item.platform !== 'qq' || qqImportEnabled);
  }, [history, qqImportEnabled]);

  if (!open) return null;

  const canSubmit = input.trim().length > 0 && !loading;

  const submitImport = () => {
    if (!platform || !canSubmit) return;
    onImport(platform, input.trim());
  };

  const importFromHistory = (item: HistoryItem) => {
    if (loading) return;
    onImport(item.platform, item.playlistId);
  };

  const removeHistory = (id: string) => {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    writeHistory(next);
  };

  if (!platform) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-label="关闭"
        />
        <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl p-5 sm:p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">导入歌单</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-white/60 mb-4">选择歌单来源平台</p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPlatform('netease')}
              className="w-full rounded-xl border border-white/10 bg-netease-card/80 px-4 py-3 text-sm text-white text-left hover:border-netease-red/40 hover:bg-white/5 transition-colors"
            >
              {PLATFORM_LABELS.netease}
            </button>
            <button
              type="button"
              onClick={() => setPlatform('qq')}
              disabled={!qqImportEnabled}
              title={qqImportEnabled ? undefined : '请配置 CYAPI_KEY 后使用'}
              className="w-full rounded-xl border border-white/10 bg-netease-card/80 px-4 py-3 text-sm text-white text-left hover:border-netease-red/40 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {PLATFORM_LABELS.qq}
            </button>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-white/60">
              <Clock className="h-3.5 w-3.5" />
              历史导入歌单
            </div>
            {visibleHistory.length === 0 ? (
              <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-xs text-netease-muted">暂无历史记录</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {visibleHistory.map((item) => (
                  <div key={item.id} className="group flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 hover:bg-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => importFromHistory(item)}
                      disabled={loading}
                      className="min-w-0 flex-1 text-left disabled:opacity-50"
                      title="直接解析该歌单"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/55">{PLATFORM_LABELS[item.platform]}</span>
                        <span className="min-w-0 truncate text-xs text-white/85">{item.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-netease-muted">ID：{item.playlistId}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHistory(item.id)}
                      disabled={loading}
                      className="rounded-lg p-1.5 text-white/35 opacity-100 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="删除历史"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭"
      />
      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl p-5 sm:p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setPlatform(null)}
              disabled={loading}
              className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              aria-label="返回选择平台"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base sm:text-lg font-semibold text-white truncate">{TITLES[platform]}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-white/60 leading-relaxed mb-4">
          {HINTS[platform]}
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={platform === 'netease'
            ? '粘贴分享链接、完整分享文案或歌单 ID...'
            : '粘贴 QQ 音乐歌单分享链接或歌单 ID...'}
          rows={4}
          disabled={loading}
          className="w-full resize-none rounded-xl border border-netease-border bg-netease-card/80 px-3 py-2.5 text-sm text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/50 transition-colors disabled:opacity-50"
        />

        <div className="flex gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm text-white/70 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitImport}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-xl text-sm bg-netease-red text-white hover:bg-red-500 transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            解析歌单
          </button>
        </div>
      </div>
    </div>
  );
}
