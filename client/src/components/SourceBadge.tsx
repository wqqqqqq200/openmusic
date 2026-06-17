import type { MusicSource } from '../types';

const SOURCE_COLORS: Record<MusicSource, string> = {
  netease: '#ec4141',
  tencent: '#31c27c',
  kugou: '#2688ee',
};

const SOURCE_LABELS: Record<MusicSource, string> = {
  netease: '网易',
  tencent: 'QQ',
  kugou: '酷狗',
};

interface Props {
  source?: MusicSource;
  className?: string;
  /** colored：红/绿品牌色；muted：列表用灰色标签 */
  variant?: 'colored' | 'muted';
}

export default function SourceBadge({ source = 'netease', className = '', variant = 'colored' }: Props) {
  const isMuted = variant === 'muted';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
        isMuted
          ? 'bg-white/6 text-netease-muted'
          : 'text-white'
      } ${className}`}
      style={isMuted ? undefined : { backgroundColor: SOURCE_COLORS[source] || SOURCE_COLORS.netease }}
    >
      {SOURCE_LABELS[source] || '网易'}
    </span>
  );
}
