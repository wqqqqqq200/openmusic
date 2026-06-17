import { useRef, useCallback, useState, useEffect } from 'react';

interface Props {
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
  thumbClassName?: string;
  showThumb?: boolean;
}

export default function ProgressBar({
  progress,
  duration,
  onSeek,
  disabled = false,
  className = 'h-1',
  trackClassName = 'bg-white/20',
  fillClassName = 'bg-white',
  thumbClassName = 'w-3 h-3',
  showThumb = false,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const calcRatio = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragProgress(calcRatio(e.clientX) * 100);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setDragProgress(calcRatio(e.clientX) * 100);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const ratio = calcRatio(e.clientX);
      setDragProgress(null);
      if (duration > 0) onSeek(ratio * duration);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [calcRatio, duration, onSeek]);

  const displayProgress = Math.min(100, dragProgress ?? progress);

  return (
    <div
      ref={barRef}
      className={`relative rounded-full touch-none select-none ${disabled ? 'cursor-default' : 'cursor-pointer'} ${trackClassName} ${className}`}
      onPointerDown={handlePointerDown}
    >
      <div
        className={`h-full rounded-full relative ${fillClassName} ${dragging.current ? '' : 'transition-all duration-300'}`}
        style={{ width: `${displayProgress}%` }}
      >
        {showThumb && (
          <div className={`absolute right-0 top-1/2 -translate-y-1/2 bg-white rounded-full shadow opacity-100 ${thumbClassName}`} />
        )}
      </div>
    </div>
  );
}
