import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, MapPin, Pencil, Shield, UserMinus, Users, X } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';
import ConfirmModal from './ConfirmModal';
import type { RoomUser } from '../types';

interface Props {
  users: RoomUser[];
  creatorId?: string | null;
  onNotice?: (message: string, type: 'success' | 'error') => void;
}

type PendingAction =
  | { type: 'kick'; user: RoomUser }
  | { type: 'admin'; user: RoomUser; admin: boolean };

export default function OnlineUsers({ users, creatorId, onNotice }: Props) {
  const room = useRoomStore((s) => s.room);
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const isOwner = useRoomStore((s) => s.isOwner);
  const adminIds = room?.adminIds || [];
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const { renameUser, kickUser, setRoomAdmin } = useSocket();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(nickname);
  const [saving, setSaving] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [adminTogglingId, setAdminTogglingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const orderedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.id === mySocketId) return -1;
      if (b.id === mySocketId) return 1;
      if (creatorId) {
        if (a.id === creatorId) return -1;
        if (b.id === creatorId) return 1;
      }
      return a.joinedAt - b.joinedAt;
    });
  }, [users, mySocketId, creatorId]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setEditing(false);
      setError('');
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    setDraftName(nickname);
  }, [nickname]);

  const saveNickname = async () => {
    const nextName = draftName.trim();
    if (!nextName || saving) return;

    setSaving(true);
    setError('');
    const res = await renameUser(nextName);
    if (res.success) {
      setNickname(nextName);
      setEditing(false);
    } else {
      setError(res.error || '改名失败');
    }
    setSaving(false);
  };

  const handleKick = (user: RoomUser) => {
    if (!isOwner || kickingId) return;
    setPendingAction({ type: 'kick', user });
  };

  const handleToggleAdmin = (user: RoomUser) => {
    if (!isOwner || adminTogglingId) return;
    const nextAdmin = !adminIds.includes(user.id);
    setPendingAction({ type: 'admin', user, admin: nextAdmin });
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'kick') {
      const user = pendingAction.user;
      setKickingId(user.id);
      setError('');
      const res = await kickUser(user.id);
      setPendingAction(null);
      if (res.success) {
        onNotice?.(res.message || `已移出「${user.nickname}」`, 'success');
      } else {
        const msg = res.error || '踢出失败';
        setError(msg);
        onNotice?.(msg, 'error');
      }
      setKickingId(null);
      return;
    }

    const user = pendingAction.user;
    setAdminTogglingId(user.id);
    setError('');
    const res = await setRoomAdmin(user.id, pendingAction.admin);
    setPendingAction(null);
    if (res.success) {
      onNotice?.(res.message || (pendingAction.admin ? `已将「${user.nickname}」设为管理员` : `已取消「${user.nickname}」的管理员`), 'success');
    } else {
      const msg = res.error || '设置管理员失败';
      setError(msg);
      onNotice?.(msg, 'error');
    }
    setAdminTogglingId(null);
  };

  const canKick = (user: RoomUser) => (
    isOwner
    && user.id !== mySocketId
    && user.id !== creatorId
    && !adminIds.includes(user.id)
  );

  const canToggleAdmin = (user: RoomUser) => (
    isOwner
    && user.id !== mySocketId
    && user.id !== creatorId
    && !user.readOnly
  );

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-netease-muted hover:bg-netease-card hover:text-white transition-colors"
        title="查看房间用户"
      >
        <Users className="w-4 h-4" />
        <div className="flex -space-x-2">
          {orderedUsers.slice(0, 5).map((user) => (
            <div
              key={user.id}
              title={user.id === creatorId ? `${user.nickname}（房主）` : user.nickname}
              className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-netease-dark ${
                user.id === creatorId
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                  : user.id === mySocketId
                    ? 'bg-gradient-to-br from-netease-red to-pink-500'
                    : 'bg-gradient-to-br from-zinc-500 to-zinc-700'
              }`}
            >
              {user.nickname.charAt(0).toUpperCase()}
              {user.id === creatorId && (
                <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-300" />
              )}
            </div>
          ))}
          {orderedUsers.length > 5 && (
            <div className="w-7 h-7 rounded-full bg-netease-card flex items-center justify-center text-[10px] text-white border-2 border-netease-dark">
              +{orderedUsers.length - 5}
            </div>
          )}
        </div>
        <span className="hidden sm:inline">共 {users.length} 人</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-netease-border/70 bg-netease-dark/95 p-3 shadow-2xl backdrop-blur z-30">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">房间用户</h3>
              <p className="text-[11px] text-netease-muted">共 {users.length} 人</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditing(false);
              }}
              className="rounded-lg p-1 text-netease-muted hover:bg-white/10 hover:text-white"
              aria-label="关闭用户列表"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
            {orderedUsers.map((user) => {
              const isMe = user.id === mySocketId;
              const isRoomCreator = Boolean(creatorId && user.id === creatorId);
              const isAdmin = adminIds.includes(user.id);

              return (
                <div
                  key={user.id}
                  className={`rounded-xl border px-2.5 py-2 ${
                    isMe
                      ? 'border-netease-red/30 bg-netease-red/10'
                      : 'border-white/5 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                        isRoomCreator
                          ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                          : isMe
                            ? 'bg-gradient-to-br from-netease-red to-pink-500'
                            : 'bg-gradient-to-br from-zinc-500 to-zinc-700'
                      }`}
                    >
                      {user.nickname.charAt(0).toUpperCase()}
                      {isRoomCreator && <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-300" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-sm text-white" title={user.nickname}>
                          {user.nickname}
                        </p>
                        {isMe && (
                          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-netease-red/20 px-1.5 py-0 text-[9px] leading-4 text-netease-red">
                            我
                          </span>
                        )}
                        {isRoomCreator && (
                          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-amber-400/15 px-1.5 py-0 text-[9px] leading-4 text-amber-300">
                            房主
                          </span>
                        )}
                        {isAdmin && !isRoomCreator && (
                          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-sky-400/15 px-1.5 py-0 text-[9px] leading-4 text-sky-300">
                            管理员
                          </span>
                        )}
                        {user.readOnly && (
                          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-white/8 px-1.5 py-0 text-[9px] leading-4 text-netease-muted">
                            TV
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-netease-muted/70">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{user.location || '未知'}</span>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center">
                      {isMe && !editing && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftName(user.nickname);
                            setEditing(true);
                          }}
                          className="rounded-lg p-1.5 text-netease-muted hover:bg-white/10 hover:text-white"
                          aria-label="修改昵称"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canToggleAdmin(user) && (
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(user)}
                          disabled={adminTogglingId === user.id}
                          className={`rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                            isAdmin
                              ? 'bg-sky-400/15 text-sky-300'
                              : 'text-netease-muted hover:bg-sky-400/10 hover:text-sky-300'
                          }`}
                          aria-label={isAdmin ? '取消管理员' : '设为管理员'}
                          title={isAdmin ? '取消管理员' : '设为管理员'}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canKick(user) && (
                        <button
                          type="button"
                          onClick={() => handleKick(user)}
                          disabled={kickingId === user.id}
                          className="rounded-lg p-1.5 text-netease-muted hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-40"
                          aria-label="踢出"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isMe && editing && (
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveNickname();
                          if (event.key === 'Escape') setEditing(false);
                        }}
                        maxLength={20}
                        className="min-w-0 flex-1 rounded-lg border border-netease-border/60 bg-netease-dark px-2 py-1 text-xs text-white outline-none focus:border-netease-red/50"
                        placeholder="输入新昵称"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={saveNickname}
                        disabled={saving || !draftName.trim()}
                        className="rounded-lg bg-netease-red px-2 text-white disabled:opacity-40"
                        title="保存昵称"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="mt-2 text-xs text-netease-red">{error}</p>}
        </div>
      )}

      {pendingAction?.type === 'kick' && (
        <ConfirmModal
          title="移出用户"
          message={
            <>
              确定将「{pendingAction.user.nickname}」移出房间吗？
              <br />
              <span className="text-netease-muted">被移出的用户将无法再次进入本房间。</span>
            </>
          }
          confirmLabel="移出"
          confirmVariant="danger"
          loading={kickingId === pendingAction.user.id}
          onConfirm={() => void executePendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction?.type === 'admin' && (
        <ConfirmModal
          title={pendingAction.admin ? '设为管理员' : '取消管理员'}
          message={
            pendingAction.admin
              ? `确定将「${pendingAction.user.nickname}」设为管理员吗？管理员可控制播放、切歌与审批。`
              : `确定取消「${pendingAction.user.nickname}」的管理员权限吗？`
          }
          confirmLabel={pendingAction.admin ? '设为管理员' : '取消管理员'}
          confirmVariant="primary"
          loading={adminTogglingId === pendingAction.user.id}
          onConfirm={() => void executePendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
