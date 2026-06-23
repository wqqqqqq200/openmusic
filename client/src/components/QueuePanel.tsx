import { useState, useEffect, useRef, useMemo } from 'react';
import { Trash2, Music, Zap, ThumbsUp } from 'lucide-react';
import { getClientId } from '../lib/clientId';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';
import { getCoverUrl } from '../api/music';
import SourceBadge from './SourceBadge';
import FavoriteButton from './FavoriteButton';

/** 单条约 64px + 间距，固定显示 3 条 */
const VISIBLE_ROWS = 3;
const ROW_HEIGHT = 64;
const ROW_GAP = 6;
const LIST_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT + (VISIBLE_ROWS - 1) * ROW_GAP;

interface Props {
  fillHeight?: boolean;
}

export default function QueuePanel({ fillHeight = false }: Props) {
  const room = useRoomStore((s) => s.room);
  const nickname = useRoomStore((s) => s.nickname);
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const isOwner = useRoomStore((s) => s.isOwner);
  const { removeSong, requestJump, toggleQueueLike } = useSocket();
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

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentKey]);

  const showQueueMessage = (message: string) => {
    setJumpMsg(message);
    setTimeout(() => setJumpMsg(''), 3000);
  };

  const handleJumpRequest = async (queueId: string) => {
    setJumpMsg('');
    const res = await requestJump(queueId);
    if (res.success) {
      showQueueMessage(isOwner ? '已插队到下一首，优先于点赞排序' : '已插队到下一首');
    } else {
      showQueueMessage(res.error || '插队失败');
    }
  };

  const handleLike = async (queueId: string) => {
    const res = await toggleQueueLike(queueId);
    if (!res.success && res.error) showQueueMessage(res.error);
  };

  if (!room) return null;

  if (allSongs.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-netease-muted ${
          fillHeight ? 'flex-1 min-h-0' : ''
        }`}
        style={fillHeight ? undefined : { height: LIST_HEIGHT }}
      >
        <Music className="w-7 h-7 mb-2 opacity-30" />
        <p className="text-xs text-center">队列为空，搜索或双击点歌</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${fillHeight ? 'h-full min-h-0' : ''}`}>
      {jumpMsg && (
        <p className="text-xs text-amber-400/80 mb-1.5 px-1 flex-shrink-0">{jumpMsg}</p>
      )}

      <div
        className={`space-y-1.5 overflow-y-auto pr-0.5 ${fillHeight ? 'flex-1 min-h-0' : ''}`}
        style={fillHeight ? undefined : { height: LIST_HEIGHT }}
      >
        {allSongs.map((song, i) => {
          const myUserId = mySocketId || getClientId();
          const isMine = !song.isCurrent && (
            (myUserId && song.requestedById === myUserId)
            || song.requestedBy === nickname
          );
          const likedByIds = Array.isArray(song.likedByIds) ? song.likedByIds : [];
          const likeCount = likedByIds.length;
          const likedByMe = Boolean(myUserId && likedByIds.includes(myUserId));
          const canJump = !song.isCurrent && (isOwner || isMine);
          const canRemove = !song.isCurrent && (isOwner || isMine);

          return (
            <div
              key={song.queueId || `current-${song.id}`}
              ref={song.isCurrent ? currentRef : undefined}
              className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                song.isCurrent
                  ? 'bg-netease-red/10 border border-netease-red/25'
                  : song.ownerPriority
                    ? 'bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/15'
                    : 'bg-netease-card/35 hover:bg-netease-card/80'
              }`}
              style={{ minHeight: ROW_HEIGHT }}
            >
              <span className="w-5 text-center text-[11px] text-netease-muted flex-shrink-0">
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
                className="w-11 h-11 rounded-lg object-cover bg-netease-card flex-shrink-0"
              />
              <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p
                    className={`min-w-0 flex-1 text-sm leading-5 truncate ${
                      song.isCurrent ? 'text-netease-red font-medium' : 'text-white/92'
                    }`}
                    title={song.name}
                  >
                    {song.name}
                  </p>
                  {Boolean(song.ownerPriority) && (
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-0 text-[9px] leading-4 text-amber-300">房主</span>
                  )}
                  <SourceBadge
                    source={song.source || 'netease'}
                    className="rounded-full px-1.5 py-0 text-[9px] leading-4"
                  />
                  <FavoriteButton
                    song={song}
                    className="w-7 h-7 text-netease-muted hover:text-rose-300"
                    iconClassName="w-3.5 h-3.5"
                  />
                  {!song.isCurrent && (
                    <div className="flex flex-shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => handleLike(song.queueId)}
                        className={`flex min-w-7 items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] transition-colors ${
                          likedByMe
                            ? 'bg-netease-red/10 text-netease-red'
                            : 'text-netease-muted hover:bg-white/10 hover:text-white'
                        }`}
                        title={likedByMe ? '取消点赞' : '点赞提高排序'}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        {likeCount > 0 && <span>{likeCount}</span>}
                      </button>
                      {canJump && (
                        <button
                          onClick={() => handleJumpRequest(song.queueId)}
                          className="rounded-lg p-1 text-amber-400/75 transition-colors hover:bg-amber-400/10 hover:text-amber-300"
                          title={isOwner ? '房主插队，优先于点赞排序' : '插队到下一首'}
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canRemove && (
                        <button
                          onClick={() => removeSong(song.queueId)}
                          className="rounded-lg p-1 text-netease-muted transition-colors hover:bg-netease-red/10 hover:text-netease-red"
                          title={isOwner && !isMine ? '移除歌曲' : '删除我的点歌'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] leading-4 text-netease-muted min-w-0">
                  <span className="min-w-0 truncate" title={song.artist}>
                    {song.artist}
                  </span>
                  {!song.isCurrent && song.requestedBy && (
                    <span className="min-w-0 truncate text-netease-muted/65" title={`${song.requestedBy}点的歌`}>
                      {song.requestedBy}点的歌
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
