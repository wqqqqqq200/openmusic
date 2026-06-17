import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onClose, duration);
    return () => clearTimeout(timerRef.current);
  }, [message, type, onClose, duration]);

  const isSuccess = type === 'success';

  return (
    <div
      className="fixed inset-x-0 top-4 z-[100] flex justify-center px-4 pointer-events-none"
      role="status"
    >
      <div
        className={`inline-flex items-center gap-2 max-w-sm px-4 py-2.5 rounded-xl text-sm shadow-lg border animate-slide-up ${
          isSuccess
            ? 'bg-netease-card border-green-500/40 text-green-400'
            : 'bg-netease-card border-amber-500/40 text-amber-300'
        }`}
      >
        {isSuccess ? <Check className="w-4 h-4 flex-shrink-0" /> : <X className="w-4 h-4 flex-shrink-0" />}
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
}
