import { useState, useEffect, useRef, useMemo } from 'react';
import { Trash2, Music, Zap } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';
import { formatDuration, getCoverUrl } from '../api/music';
import SourceBadge from './SourceBadge';

/** 单条约 52px + 间距，固定显示 3 条 */
const VISIBLE_ROWS = 3;
const ROW_HEIGHT = 52;
const ROW_GAP = 4;
const LIST_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT + (VISIBLE_ROWS - 1) * ROW_GAP;

export default function QueuePanel() {
  const room = useRoomStore((s) => s.room);
  const nickname = useRoomStore((s) => s.nickname);
  const isOwner = useRoomStore((s) => s.isOwner);
  const { removeSong, requestJump } = useSocket();
  const [jumpMsg, setJumpMsg] = useState('');
  const currentRef = useRef<HTMLDivElement>(null);

  const allSongs = useMemo(() => {
    if (!room) return [];
    return [
      ...(room.current ? [{ ...room.current, isCurrent: true }] : []),
      ...room.queue.map((s) => ({ ...s, isCurrent: false })),
    ];
  }, [room]);

  const currentKey = room?.current?.queueId || '';
  const pendingQueueIds = new Set(room?.jumpRequests.map((r) => r.queueId) ?? []);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentKey]);

  const handleJumpRequest = async (queueId: string) => {
    setJumpMsg('');
    const res = await requestJump(queueId);
    if (res.success) {
      setJumpMsg('已提交插队申请，等待房主同意');
      setTimeout(() => setJumpMsg(''), 3000);
    } else {
      setJumpMsg(res.error || '申请失败');
    }
  };

  if (!room) return null;

  if (allSongs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-netease-muted"
        style={{ height: LIST_HEIGHT }}
      >
        <Music className="w-7 h-7 mb-2 opacity-30" />
        <p className="text-xs text-center">队列为空，搜索或双击点歌</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {jumpMsg && (
        <p className="text-xs text-amber-400/80 mb-1.5 px-1 flex-shrink-0">{jumpMsg}</p>
      )}

      <div
        className="space-y-1 overflow-y-auto pr-0.5"
        style={{ height: LIST_HEIGHT }}
      >
        {allSongs.map((song, i) => {
          const isMine = !song.isCurrent && song.requestedBy === nickname;
          const canRemove = !song.isCurrent && (isOwner || isMine);
          const hasPending = pendingQueueIds.has(song.queueId);

          return (
            <div
              key={song.queueId || `current-${song.id}`}
              ref={song.isCurrent ? currentRef : undefined}
              className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                song.isCurrent ? 'bg-netease-red/10 border border-netease-red/20' : 'hover:bg-netease-card/80'
              }`}
              style={{ minHeight: ROW_HEIGHT }}
            >
              <span className="w-5 text-center text-[10px] text-netease-muted flex-shrink-0">
                {song.isCurrent ? (
                  <span className="inline-flex gap-0.5 items-end h-3.5">
                    <span className="w-0.5 h-1.5 bg-netease-red animate-pulse" />
                    <span className="w-0.5 h-2.5 bg-netease-red animate-pulse delay-75" />
                    <span className="w-0.5 h-1 bg-netease-red animate-pulse delay-150" />
                  </span>
                ) : (
                  i
                )}
              </span>
              <img
                src={getCoverUrl(song)}
                alt=""
                className="w-9 h-9 rounded-md object-cover bg-netease-card flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className={`text-xs truncate ${song.isCurrent ? 'text-netease-red font-medium' : ''}`}>
                    {song.name}
                  </p>
                  <SourceBadge source={song.source || 'netease'} variant="muted" />
                  {hasPending && (
                    <span className="text-[9px] text-amber-400/80 flex-shrink-0">待审</span>
                  )}
                </div>
                <p className="text-[10px] text-netease-muted truncate">{song.artist}</p>
              </div>
              {song.duration && (
                <span className="text-[10px] text-netease-muted hidden xl:block flex-shrink-0">
                  {formatDuration(song.duration / 1000)}
                </span>
              )}
              {!song.isCurrent && (
                <span className="text-[10px] text-netease-muted/70 hidden sm:block flex-shrink-0 max-w-[3.5rem] truncate">
                  {song.requestedBy}
                </span>
              )}
              {isMine && !hasPending && (
                <button
                  onClick={() => handleJumpRequest(song.queueId)}
                  className="p-1 rounded-md text-amber-400/70 hover:text-amber-400 hover:bg-amber-400/10 transition-colors flex-shrink-0"
                  title="申请插队"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              )}
              {canRemove && (
                <button
                  onClick={() => removeSong(song.queueId)}
                  className="p-1 rounded-md text-netease-muted hover:text-netease-red hover:bg-netease-red/10 transition-colors flex-shrink-0"
                  title={isOwner && !isMine ? '移除歌曲' : '删除我的点歌'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
