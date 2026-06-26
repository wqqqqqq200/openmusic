import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { NETEASE_FM_MODE_OPTIONS, normalizeFmMode } from '../api/music/fmMode';

interface Props {
  open: boolean;
  value: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (mode: string) => void;
}

export default function RoomFmModeModal({ open, value, saving = false, onClose, onSave }: Props) {
  if (!open) return null;

  const current = normalizeFmMode(value);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭"
      />
      <div
        className="relative w-full max-w-md animate-fade-in rounded-2xl border border-white/10 bg-netease-dark p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">私人漫游模式</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-netease-muted">
          队列为空时通过网易云私人漫游自动推荐下一首
        </p>

        <div className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
          {NETEASE_FM_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => onSave(opt.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                current === opt.value
                  ? 'border-netease-red/25 bg-netease-red/[0.08]'
                  : 'border-transparent bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <p className={`text-sm font-medium ${current === opt.value ? 'text-white' : 'text-white/90'}`}>
                {opt.label}
              </p>
              {opt.description && (
                <p className="mt-0.5 text-xs text-netease-muted">{opt.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
