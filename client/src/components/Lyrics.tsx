import { useEffect, useRef, useState } from 'react';
import { filterDisplayLyrics } from '../api/music';
import type { LyricLine } from '../types';

interface Props {
  lines: LyricLine[];
  currentTime: number;
  onSeek?: (time: number) => void;
  /** 侧边布局：左对齐，当前句居中 */
  variant?: 'center' | 'side';
  size?: 'default' | 'large';
}

const SIDE_WINDOW = 5;

export default function Lyrics({ lines, currentTime, onSeek, variant = 'center', size = 'default' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [manualScroll, setManualScroll] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();

  const displayLines = filterDisplayLyrics(lines);
  const isSide = variant === 'side';
  const isLarge = size === 'large';

  const activeIndex = displayLines.findIndex((line, i) => {
    const next = displayLines[i + 1];
    return currentTime >= line.time && (!next || currentTime < next.time);
  });

  const windowStart = isSide
    ? Math.max(0, Math.min(
        activeIndex >= 0 ? activeIndex - 1 : 0,
        Math.max(0, displayLines.length - SIDE_WINDOW),
      ))
    : 0;
  const windowEnd = isSide ? Math.min(displayLines.length, windowStart + SIDE_WINDOW) : displayLines.length;
  const visibleLines = isSide ? displayLines.slice(windowStart, windowEnd) : displayLines;

  useEffect(() => {
    if (isSide || manualScroll || !activeRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const active = activeRef.current;
    const offset = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;

    container.scrollTo({ top: offset, behavior: 'smooth' });
  }, [activeIndex, manualScroll, isSide]);

  const handleScroll = () => {
    if (isSide) return;
    setManualScroll(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setManualScroll(false), 5000);
  };

  if (displayLines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40 text-base 2xl:text-2xl 3xl:text-3xl">
        暂无歌词
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`flex-1 ${
        isSide
          ? 'flex flex-col justify-center overflow-hidden px-1'
          : 'overflow-y-auto scrollbar-hide px-6 py-8'
      }`}
      style={isSide
        ? { maskImage: 'linear-gradient(transparent, black 8%, black 92%, transparent)' }
        : { maskImage: 'linear-gradient(transparent, black 12%, black 88%, transparent)' }}
    >
      <div className={isSide ? (isLarge ? 'space-y-4 py-2 2xl:space-y-8 2xl:py-4' : 'space-y-3 py-2') : 'space-y-5 py-[40vh] 2xl:space-y-8'}>
        {visibleLines.map((line, i) => {
          const realIndex = isSide ? windowStart + i : i;
          const isActive = realIndex === activeIndex;
          const isPast = activeIndex >= 0 && realIndex < activeIndex;

          const activeSideCls = isLarge
            ? 'text-white text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl 3xl:text-5xl font-semibold leading-snug'
            : 'text-white text-base lg:text-lg xl:text-xl 2xl:text-2xl font-semibold leading-snug';
          const pastSideCls = isLarge
            ? 'text-white/20 text-base lg:text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl leading-snug'
            : 'text-white/20 text-sm lg:text-base xl:text-lg 2xl:text-xl leading-snug';
          const futureSideCls = isLarge
            ? 'text-white/35 text-base lg:text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl leading-snug'
            : 'text-white/35 text-sm lg:text-base xl:text-lg 2xl:text-xl leading-snug';

          return (
            <div
              key={`${line.time}-${realIndex}`}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek?.(line.time)}
              className={`transition-all duration-500 cursor-pointer ${
                isSide ? 'text-left' : 'text-center'
              } ${
                isActive
                  ? isSide
                    ? activeSideCls
                    : 'text-white text-xl font-bold scale-[1.02]'
                  : isPast
                    ? isSide ? pastSideCls : 'text-white/25 text-base'
                    : isSide ? futureSideCls : 'text-white/45 text-base hover:text-white/60'
              }`}
            >
              <p>{line.text}</p>
              {line.translation && (
                <p className={`mt-0.5 ${isLarge ? 'text-sm lg:text-base 2xl:text-xl 3xl:text-2xl' : 'text-xs 2xl:text-sm'} ${isActive ? 'text-white/60' : 'text-white/15'}`}>
                  {line.translation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
