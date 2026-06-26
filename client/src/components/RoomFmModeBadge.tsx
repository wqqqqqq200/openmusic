import { getFmModeLabel, normalizeFmMode } from '../api/music/fmMode';

interface Props {
  fmMode?: string | null;
  className?: string;
}

export default function RoomFmModeBadge({ fmMode, className = '' }: Props) {
  const mode = normalizeFmMode(fmMode);
  const label = getFmModeLabel(mode);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] ${className}`}
      title={`私人漫游：${label}`}
    >
      <span className="font-medium text-[#ec4141]">漫游</span>
      <span className="text-netease-muted">{label}</span>
    </span>
  );
}
