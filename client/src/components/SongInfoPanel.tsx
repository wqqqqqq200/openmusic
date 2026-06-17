import SourceBadge from './SourceBadge';
import type { MusicSource } from '../types';

interface Props {
  name: string;
  artist: string;
  source?: MusicSource;
  requestedBy?: string;
  size?: 'default' | 'large';
}

export default function SongInfoPanel({
  name,
  artist,
  source = 'netease',
  requestedBy,
  size = 'default',
}: Props) {
  const large = size === 'large';

  return (
    <div className={`flex-shrink-0 px-1 ${large ? 'pt-6 lg:pt-10' : 'pt-6 lg:pt-10'} pb-4`}>
      <div className="flex items-center gap-2 min-w-0">
        <h2 className={`font-semibold truncate ${large ? 'text-xl lg:text-2xl' : 'text-xl lg:text-2xl'}`}>{name}</h2>
        <SourceBadge source={source} />
      </div>
      <p className={`text-white/50 mt-2 truncate ${large ? 'text-sm' : 'text-sm'}`}>        歌手：{artist}
        {requestedBy && <span className="text-white/30"> · {requestedBy} 点的歌</span>}
      </p>
    </div>
  );
}
