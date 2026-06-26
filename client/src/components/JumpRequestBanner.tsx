import { Check, X } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';

export default function JumpRequestBanner() {
  const room = useRoomStore((s) => s.room);
  const canControlPlayback = useRoomStore((s) => s.canControlPlayback);
  const { approveSkip, rejectSkip } = useSocket();

  if (!room || !canControlPlayback) return null;

  const skipRequests = room.skipRequests ?? [];
  if (skipRequests.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {skipRequests.map((req) => (
        <div
          key={req.id}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-sky-200/90 truncate">
              <span className="font-medium">{req.nickname}</span> 申请切歌
            </p>
            <p className="text-xs text-sky-200/50 truncate">{req.songName}</p>
          </div>
          <button
            onClick={() => approveSkip(req.id)}
            className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            title="同意"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => rejectSkip(req.id)}
            className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            title="拒绝"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
