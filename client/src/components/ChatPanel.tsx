import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useSocket } from '../hooks/useSocket';

export default function ChatPanel() {
  const room = useRoomStore((s) => s.room);
  const nickname = useRoomStore((s) => s.nickname);
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const { sendChat } = useSocket();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.messages.length]);

  if (!room) return null;

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    const res = await sendChat(text.trim());
    if (res.success) {
      setText('');
    } else {
      setError(res.error || '发送失败');
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full bg-netease-card/30 border border-netease-border/50 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-netease-border/50 flex-shrink-0">
        <MessageCircle className="w-4 h-4 text-netease-muted" />
        <h3 className="text-sm font-medium">聊天室</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {room.messages.length === 0 ? (
          <p className="text-xs text-netease-muted text-center py-8">暂无消息，打个招呼吧</p>
        ) : (
          room.messages.map((msg) => {
            const isMe = msg.userId === mySocketId;
            const isOwner = msg.userId === room.ownerId;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[10px] ${isMe ? 'text-netease-red/80' : 'text-netease-muted'}`}>
                    {msg.nickname}
                    {isOwner && <span className="ml-1 text-amber-400/80">房主</span>}
                  </span>
                </div>
                <div
                  className={`max-w-[90%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                    isMe
                      ? 'bg-netease-red/20 text-white rounded-br-md'
                      : 'bg-netease-dark/80 text-white/90 rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-netease-border/50 flex-shrink-0">
        {error && <p className="text-xs text-netease-red mb-1">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`${nickname || '你'}说点什么...`}
            maxLength={500}
            className="flex-1 bg-netease-dark border border-netease-border/50 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-netease-muted/50 focus:outline-none focus:border-netease-red/40"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="px-3 py-1.5 rounded-xl bg-netease-red text-white disabled:opacity-40 hover:bg-red-500 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
