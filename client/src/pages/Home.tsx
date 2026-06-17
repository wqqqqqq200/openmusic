import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Users, Radio, ArrowRight } from 'lucide-react';
import { createRoom, checkRoom } from '../api/meting';
import { useRoomStore } from '../stores/roomStore';

export default function Home() {
  const navigate = useNavigate();
  const { nickname, setNickname } = useRoomStore();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!nickname.trim()) {
      setError('请输入昵称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const room = await createRoom();
      navigate(`/room/${room.id}`);
    } catch {
      setError('创建房间失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError('请输入昵称');
      return;
    }
    if (!roomCode.trim()) {
      setError('请输入房间号');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const exists = await checkRoom(roomCode.trim().toUpperCase());
      if (!exists) {
        setError('房间不存在，请检查房间号');
        return;
      }
      navigate(`/room/${roomCode.trim().toUpperCase()}`);
    } catch {
      setError('加入房间失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center relative overflow-hidden px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-netease-red/20 via-transparent to-purple-900/20" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-netease-red/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-netease-red/20 mb-6">
            <Music className="w-10 h-10 text-netease-red" />
          </div>
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-gradient">OpenMusic</span>
          </h1>
          <p className="text-netease-muted text-sm">在线点歌 · 一起听歌</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-netease-border/50 shadow-2xl">
          <label className="block text-sm text-netease-muted mb-2">你的昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="输入昵称，让大家认识你"
            maxLength={20}
            className="w-full bg-netease-dark border border-netease-border rounded-xl px-4 py-3 text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/60 transition-colors mb-6"
          />

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-netease-red hover:bg-red-500 disabled:opacity-50 text-white font-medium py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-netease-red/25 mb-4"
          >
            <Radio className="w-5 h-5" />
            创建房间
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-netease-border" />
            <span className="text-xs text-netease-muted">或加入已有房间</span>
            <div className="flex-1 h-px bg-netease-border" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="房间号"
              maxLength={6}
              className="flex-1 bg-netease-dark border border-netease-border rounded-xl px-4 py-3 text-white uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/60 transition-colors"
            />
            <button
              onClick={handleJoin}
              disabled={loading}
              className="flex items-center gap-1 bg-netease-card hover:bg-netease-hover border border-netease-border disabled:opacity-50 text-white px-5 py-3 rounded-xl transition-colors"
            >
              加入
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <p className="text-netease-red text-sm mt-4 text-center">{error}</p>
          )}
        </div>

        <div className="flex justify-center gap-8 mt-8 text-netease-muted text-xs">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>多人实时同步</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5" />
            <span>网易云曲库</span>
          </div>
        </div>
      </div>
    </div>
  );
}
