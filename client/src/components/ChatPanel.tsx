import { useMemo, useState, useRef, useEffect } from 'react';
import { MessageCircle, Reply, Send, Smile, X } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { getClientId } from '../lib/clientId';
import { useSocket } from '../hooks/useSocket';
import type { ChatMessage, ChatReplyRef, RoomUser } from '../types';
import {
  getInitialQQFaces,
  loadQQFaces,
  parseQQFaceTokens,
  preloadQQFaceImages,
  qqFaceToken,
  type QFaceItem,
} from '../lib/qface';

const MAX_CHAT_LENGTH = 500;

function compactReplyText(text: string) {
  return text.replace(/\s+/g, ' ').slice(0, 48);
}

export default function ChatPanel() {
  const room = useRoomStore((s) => s.room);
  const nickname = useRoomStore((s) => s.nickname);
  const mySocketId = useRoomStore((s) => s.mySocketId);
  const { sendChat } = useSocket();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [qqFaces, setQQFaces] = useState<QFaceItem[]>(() => getInitialQQFaces());
  const [loadingFaces, setLoadingFaces] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const composingRef = useRef(false);
  const roomIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);

  const faceMap = useMemo(() => new Map(qqFaces.map((face) => [face.id, face])), [qqFaces]);
  const userMap = useMemo(() => new Map((room?.users || []).map((user) => [user.id, user])), [room?.users]);
  const mentionUsers = useMemo(() => {
    const myUserId = mySocketId || getClientId();
    return (room?.users || []).filter((user) => user.id !== myUserId).slice(0, 8);
  }, [mySocketId, room?.users]);

  useEffect(() => {
    if (!room?.id) return;
    if (roomIdRef.current !== room.id) {
      roomIdRef.current = room.id;
      stickToBottomRef.current = true;
      setReplyTo(null);
      setShowMentionPicker(false);
      setMentionIndex(0);
      notifiedMessageIdsRef.current.clear();
    }
  }, [room?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToBottom = (behavior: ScrollBehavior) => requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior, block: 'end' }));
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (stickToBottomRef.current) scrollToBottom('instant');
    else if (distanceToBottom < 120) scrollToBottom('smooth');
  }, [room?.messages.length, room?.id]);

  useEffect(() => {
    if (!room?.messages.length || typeof Notification === 'undefined') return;
    const myUserId = mySocketId || getClientId();
    const myName = nickname.trim();
    const latestMessages = room.messages.slice(-5);

    for (const msg of latestMessages) {
      if (notifiedMessageIdsRef.current.has(msg.id) || msg.userId === myUserId) continue;
      const mentionedById = msg.mentions?.some((mention) => mention.id === myUserId);
      const mentionedByName = myName ? msg.text.includes(`@${myName}`) : false;
      if (!mentionedById && !mentionedByName) continue;

      notifiedMessageIdsRef.current.add(msg.id);
      const notify = () => {
        if (Notification.permission !== 'granted') return;
        const notification = new Notification(`${msg.nickname} 提到了你`, {
          body: compactReplyText(msg.text),
          tag: `openmusic-mention-${room.id}-${msg.id}`,
          silent: false,
        });
        notification.onclick = () => window.focus();
      };

      if (Notification.permission === 'default') {
        void Notification.requestPermission().then(notify);
      } else {
        notify();
      }
    }
  }, [mySocketId, nickname, room?.id, room?.messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [room?.id]);

  useEffect(() => {
    if (!showEmoji) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (emojiPanelRef.current?.contains(target)) return;
      setShowEmoji(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showEmoji]);

  useEffect(() => {
    let cancelled = false;
    setLoadingFaces(true);
    loadQQFaces()
      .then((faces) => {
        if (cancelled) return;
        setQQFaces(faces);
        preloadQQFaceImages(faces);
      })
      .finally(() => {
        if (!cancelled) setLoadingFaces(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!room) return null;

  const serializeEditor = () => {
    const editor = inputRef.current;
    if (!editor) return text;
    const readNode = (node: ChildNode): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (!(node instanceof HTMLElement)) return '';
      if (node.dataset.qqFaceId) return qqFaceToken(node.dataset.qqFaceId);
      if (node.tagName === 'BR') return '';
      return Array.from(node.childNodes).map(readNode).join('');
    };
    return Array.from(editor.childNodes).map(readNode).join('');
  };

  const syncEditorState = () => {
    const nextText = serializeEditor();
    setText(nextText);
    const shouldShowMentions = nextText.endsWith('@') && mentionUsers.length > 0;
    setShowMentionPicker(shouldShowMentions);
    if (shouldShowMentions) setMentionIndex(0);
  };

  const getSelectedTextLength = () => {
    const editor = inputRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return 0;
    return selection.toString().length;
  };

  const insertPlainText = (value: string) => {
    const editor = inputRef.current;
    if (!editor) {
      setText((current) => `${current}${value}`.slice(0, MAX_CHAT_LENGTH));
      setShowMentionPicker(false);
      return;
    }
    editor.focus();
    document.execCommand('insertText', false, value);
    syncEditorState();
  };

  const clearEditor = () => {
    if (inputRef.current) inputRef.current.textContent = '';
    setText('');
    setShowMentionPicker(false);
    setMentionIndex(0);
  };

  const buildMentions = (messageText: string) => {
    return room.users
      .filter((user) => messageText.includes(`@${user.nickname}`))
      .slice(0, 10)
      .map((user) => ({ id: user.id, nickname: user.nickname }));
  };

  const handleSend = async () => {
    const messageText = serializeEditor().trim();
    if (!messageText || sending) return;
    setText(messageText);
    setSending(true);
    setError('');
    const res = await sendChat(messageText, { mentions: buildMentions(messageText), replyTo });
    if (res.success) {
      clearEditor();
      setReplyTo(null);
    } else {
      setError(res.error || '发送失败');
    }
    setSending(false);
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyTo({ id: msg.id, userId: msg.userId, nickname: msg.nickname, text: compactReplyText(msg.text) });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleAt = (user: RoomUser) => {
    const currentText = serializeEditor();
    if (currentText.endsWith('@')) {
      const editor = inputRef.current;
      if (editor?.lastChild?.nodeType === Node.TEXT_NODE) {
        editor.lastChild.textContent = (editor.lastChild.textContent || '').slice(0, -1);
      }
      setText(serializeEditor());
    }
    insertPlainText(`@${user.nickname} `);
    setShowMentionPicker(false);
    setMentionIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const insertEmoji = (face: QFaceItem) => {
    const editor = inputRef.current;
    const token = qqFaceToken(face.id);
    if (!editor) {
      setText((value) => `${value}${token}`.slice(0, MAX_CHAT_LENGTH));
      return;
    }
    if (serializeEditor().length - getSelectedTextLength() + token.length > MAX_CHAT_LENGTH) {
      setError(`消息最多 ${MAX_CHAT_LENGTH} 字`);
      editor.focus();
      setShowMentionPicker(false);
      return;
    }
    const img = document.createElement('img');
    img.src = face.url;
    img.alt = face.text;
    img.title = face.text;
    img.dataset.qqFaceId = face.id;
    img.contentEditable = 'false';
    img.className = 'mx-0.5 inline-block h-5 w-auto max-w-6 object-contain align-[-0.2em]';
    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchorNode = selection?.anchorNode;
    if (!range || !anchorNode || !editor.contains(anchorNode)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    requestAnimationFrame(() => {
      editor.focus();
      selection?.removeAllRanges();
      selection?.addRange(range);
      syncEditorState();
    });
  };

  const renderMessageText = (messageText: string) => {
    return parseQQFaceTokens(messageText).map((part, index) => {
      if (typeof part === 'string') {
        const pieces = part.split(/(@[^\s@]{1,24})/g);
        return pieces.map((piece, pieceIndex) => piece.startsWith('@')
          ? <span key={`mention-${index}-${pieceIndex}`} className="text-sky-300">{piece}</span>
          : <span key={`text-${index}-${pieceIndex}`}>{piece}</span>);
      }
      const face = faceMap.get(part.id);
      if (!face) return <span key={`face-${index}`} className="text-netease-muted">[QQ表情]</span>;
      return <img key={`face-${part.id}-${index}`} src={face.url} alt={face.text} title={face.text} className="mx-0.5 inline-block h-7 w-auto max-w-8 object-contain align-middle" loading="lazy" />;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-netease-border/50 bg-netease-card/30">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-netease-border/50 px-4 py-2">
        <MessageCircle className="h-4 w-4 text-netease-muted" />
        <h3 className="text-sm font-medium">聊天室</h3>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {room.messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-netease-muted">暂无消息，打个招呼吧</p>
        ) : room.messages.map((msg) => {
          const myUserId = mySocketId || getClientId();
          const isMe = msg.userId === myUserId;
          const isOwner = msg.userId === room.ownerId;
          const user = userMap.get(msg.userId);
          return (
            <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`} onContextMenu={(event) => { event.preventDefault(); handleReply(msg); }}>
              <div className="mb-0.5 flex items-center gap-1.5">
                <button type="button" onClick={() => user && handleAt(user)} className={`text-[10px] ${isMe ? 'text-netease-red/80' : 'text-netease-muted'} hover:text-sky-300`}>
                  {msg.nickname}{isOwner && <span className="ml-1 text-amber-400/80">房主</span>}
                </button>
              </div>
              <div className={`flex max-w-[90%] items-start gap-1.5 ${isMe ? 'justify-end' : ''}`}>
                <div className={`rounded-2xl px-3 py-1.5 text-sm leading-7 break-words ${isMe ? 'rounded-br-md bg-netease-red/20 text-white' : 'rounded-bl-md bg-netease-dark/80 text-white/90'}`}>
                  {msg.replyTo && (
                    <div className="mb-1 rounded-lg border-l-2 border-white/20 bg-black/20 px-2 py-1 text-xs leading-4 text-netease-muted">
                      回复 {msg.replyTo.nickname}：{compactReplyText(msg.replyTo.text)}
                    </div>
                  )}
                  {renderMessageText(msg.text)}
                </div>
                <button type="button" onClick={() => handleReply(msg)} className="mt-1 rounded p-0.5 text-netease-muted opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100" title="回复">
                  <Reply className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-netease-border/50 p-2">
        {replyTo && (
          <div className="mb-1.5 flex items-center justify-between rounded-xl bg-white/5 px-2 py-1 text-xs text-netease-muted">
            <span className="min-w-0 truncate">回复 {replyTo.nickname}：{compactReplyText(replyTo.text)}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="ml-2 rounded p-0.5 hover:bg-white/10"><X className="h-3 w-3" /></button>
          </div>
        )}
        {error && <p className="mb-1 text-xs text-netease-red">{error}</p>}
        <div className="relative flex items-center gap-2" ref={emojiPanelRef}>
          {showEmoji && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-netease-border/70 bg-netease-dark/95 p-2 shadow-2xl backdrop-blur">
              <div className="mb-1.5 flex items-center justify-between px-1"><span className="text-[11px] text-netease-muted">QQNT 表情</span><span className="text-[10px] text-netease-muted/60">{loadingFaces ? '正在补全...' : '点击插入'}</span></div>
              <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto pr-0.5">
                {qqFaces.map((face) => <button key={face.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(face)} className="flex h-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:bg-white/15" title={face.text}><img src={face.url} alt="" className="h-6 w-auto max-w-7 object-contain" loading="lazy" /></button>)}
              </div>
            </div>
          )}
          <button type="button" onClick={() => setShowEmoji((value) => !value)} className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-netease-border/50 transition-colors ${showEmoji ? 'border-netease-red/30 bg-netease-red/15 text-netease-red' : 'bg-netease-dark text-netease-muted hover:bg-white/5 hover:text-white'}`} title="QQ 表情"><Smile className="h-4 w-4" /></button>
          <div className="relative min-w-0 flex-1">
            {showMentionPicker && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-2xl border border-netease-border/70 bg-netease-dark/95 p-1.5 shadow-2xl backdrop-blur">
                {mentionUsers.map((user, index) => (
                  <button
                    key={user.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setMentionIndex(index)}
                    onClick={() => handleAt(user)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${index === mentionIndex ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/10'}`}
                  >
                    <span className="min-w-0 truncate">{user.nickname}</span>
                    {user.id === room.ownerId && <span className="ml-2 flex-shrink-0 text-[10px] text-amber-400/80">房主</span>}
                  </button>
                ))}
              </div>
            )}
            {!text && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-netease-muted/50">{nickname || '你'}说点什么...</span>}
            <div
              ref={inputRef}
              role="textbox"
              aria-label="聊天输入框"
              contentEditable
              suppressContentEditableWarning
              onBeforeInput={(event) => {
                const nativeEvent = event.nativeEvent as InputEvent;
                const inputType = nativeEvent.inputType ?? '';
                if (inputType.startsWith('delete') || nativeEvent.isComposing) return;
                const data = nativeEvent.data || '';
                if (serializeEditor().length - getSelectedTextLength() + data.length > MAX_CHAT_LENGTH) {
                  event.preventDefault();
                  setError(`消息最多 ${MAX_CHAT_LENGTH} 字`);
                }
              }}
              onInput={syncEditorState}
              onPaste={(event) => {
                event.preventDefault();
                const remaining = MAX_CHAT_LENGTH - serializeEditor().length + getSelectedTextLength();
                if (remaining <= 0) return setError(`消息最多 ${MAX_CHAT_LENGTH} 字`);
                document.execCommand('insertText', false, event.clipboardData.getData('text/plain').slice(0, remaining));
                syncEditorState();
              }}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; syncEditorState(); }}
              onKeyDown={(event) => {
                if (showMentionPicker && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setMentionIndex((current) => {
                    const delta = event.key === 'ArrowDown' ? 1 : -1;
                    return (current + delta + mentionUsers.length) % mentionUsers.length;
                  });
                  return;
                }
                if (showMentionPicker && (event.key === 'Tab' || event.key === 'Enter')) {
                  event.preventDefault();
                  const user = mentionUsers[mentionIndex];
                  if (user) handleAt(user);
                  return;
                }
                if (event.key === 'Escape' && showMentionPicker) {
                  event.preventDefault();
                  setShowMentionPicker(false);
                  setMentionIndex(0);
                  return;
                }
                if (event.key !== 'Enter') return;
                if (event.nativeEvent.isComposing || composingRef.current) return;
                event.preventDefault();
                void handleSend();
              }}
              className="h-9 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-xl border border-netease-border/50 bg-netease-dark px-3 py-1.5 text-sm leading-6 text-white focus:border-netease-red/40 focus:outline-none"
            />
          </div>
          <button onClick={handleSend} disabled={sending || !text.trim()} className="rounded-xl bg-netease-red px-3 py-1.5 text-white transition-colors hover:bg-red-500 disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
