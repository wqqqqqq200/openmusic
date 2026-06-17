import { useId } from 'react';

interface Props {
  coverUrl: string;
  isPlaying: boolean;
  className?: string;
  size?: 'default' | 'large';
}

const SIZE_CLASS = {
  default: 'w-52 h-52 sm:w-60 sm:h-60 lg:w-72 lg:h-72 xl:w-80 xl:h-80 2xl:w-96 2xl:h-96',
  large: 'w-60 h-60 sm:w-72 sm:h-72 lg:w-80 lg:h-80 xl:w-[400px] xl:h-[400px] 2xl:w-[500px] 2xl:h-[500px] 3xl:w-[600px] 3xl:h-[600px]',
};

/** SVG viewBox 140×100，铰链圆心 — 改圆心坐标时同步改这里 */
const HINGE_CX = 30;
const HINGE_CY = 35;
const ARM_PIVOT = `${(HINGE_CX / 140) * 100}% ${(HINGE_CY / 100) * 100}%`;

export default function VinylPlayer({ coverUrl, isPlaying, className = '', size = 'default' }: Props) {
  const gradId = useId().replace(/:/g, '');

  return (
    <div className={`relative pt-[14%] ${className}`}>
      {/* 唱针臂 — 位于唱片上方，播放时落下，暂停时摆到外侧 */}
      <div
        className="absolute z-30 top-0 right-[-5%] w-[70%] transition-transform duration-1000 ease-in-out pointer-events-none"
        style={{
          transformOrigin: ARM_PIVOT,
          transform: isPlaying ? 'rotate(60deg)' : 'rotate(20deg)',
        }}
      >
        <svg viewBox="0 0 140 100" className="w-full h-auto drop-shadow-lg" fill="none">
          <circle cx={HINGE_CX} cy={HINGE_CY} r="10" fill="#e0e0e0" stroke="#aaa" strokeWidth="1.5" />
          <circle cx={HINGE_CX} cy={HINGE_CY} r="4.5" fill="#777" />
          <path
            d={`M${HINGE_CX + 8} ${HINGE_CY - 2} L118 22`}
            stroke={`url(#${gradId})`}
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          <rect x="108" y="12" width="20" height="14" rx="2.5" fill="#b8b8b8" transform="rotate(-32 118 19)" />
          <path d="M118 18 L124 4" stroke="#888" strokeWidth="3" strokeLinecap="round" />
          <circle cx="124" cy="3" r="2" fill="#666" />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e8e8e8" />
              <stop offset="100%" stopColor="#a0a0a0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 黑胶唱片 */}
      <div className={`relative ${SIZE_CLASS[size]}`}>
        <div
          className={`vinyl-disc w-full h-full rounded-full relative shadow-[0_8px_40px_rgba(0,0,0,0.6)]${isPlaying ? ' vinyl-disc--playing' : ''}`}
          style={{
            background: `
              radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0d0d0d 100%),
              repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 3px)
            `,
          }}
        >
          <div className="absolute inset-[2%] rounded-full border border-white/[0.04]" />
          <div className="absolute inset-[5%] rounded-full border border-white/[0.03]" />
          <div className="absolute inset-[9%] rounded-full border border-white/[0.02]" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[62%] h-[62%] rounded-full overflow-hidden ring-2 ring-black/50 shadow-inner">
              <img src={coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="absolute w-[4%] h-[4%] rounded-full bg-[#111] ring-1 ring-white/10 z-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
