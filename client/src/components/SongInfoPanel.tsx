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
    <div className={`flex-shrink-0 px-1 ${large ? 'pt-6 lg:pt-10 2xl:pt-14' : 'pt-6 lg:pt-10'} pb-4`}>
      <div className="flex items-center gap-2 2xl:gap-4 min-w-0">
        <h2 className={`font-semibold truncate ${large ? 'text-xl lg:text-2xl 2xl:text-4xl 3xl:text-5xl' : 'text-xl lg:text-2xl 2xl:text-3xl'}`}>{name}</h2>
        <SourceBadge source={source} className={large ? '2xl:text-base 2xl:px-3 2xl:py-1 3xl:text-xl 3xl:px-4 3xl:py-1.5' : '2xl:text-sm 2xl:px-2 2xl:py-0.5'} />
      </div>
      <p className={`text-white/50 mt-2 truncate ${large ? 'text-sm 2xl:text-xl 3xl:text-2xl' : 'text-sm 2xl:text-base'}`}>        歌手：{artist}
        {requestedBy && <span className="text-white/30"> · {requestedBy} 点的歌</span>}
      </p>
    </div>
  );
}
