export type MusicSource = 'netease' | 'tencent' | 'kugou';

export interface RoomAudioQuality {
  netease: string;
  tencent: string;
}

export interface Song {
  id: string;
  source: MusicSource;
  name: string;
  artist: string;
  album?: string;
  pic?: string;
  duration?: number;
  /** 直链播放地址（酷狗等） */
  url?: string;
  /** 歌词文本或歌词 API 地址 */
  lrc?: string;
}

export interface QueueItem extends Song {
  queueId: string;
  requestedBy: string;
  requestedById?: string;
  addedAt: number;
  likedByIds?: string[];
  ownerPriority?: number;
}

export interface SongHistoryItem extends Song {
  requestedBy: string;
  requestedById?: string;
  requestedAt: number;
}

export interface RoomUser {
  id: string;
  nickname: string;
  readOnly?: boolean;
  joinedAt: number;
  location?: string;
}

export interface JumpRequest {
  id: string;
  queueId: string;
  songName: string;
  nickname: string;
  requestedBy: string;
  requestedAt: number;
}

export interface ChatMention {
  id: string;
  nickname: string;
}

export interface ChatReplyRef {
  id: string;
  userId: string;
  nickname: string;
  text: string;
}

export interface ChatReactionUser {
  userId: string;
  nickname: string;
}

export interface ChatReactionGroup {
  emoji: string;
  users: ChatReactionUser[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  mentions?: ChatMention[];
  replyTo?: ChatReplyRef | null;
  timestamp: number;
  reactions?: ChatReactionGroup[];
}

export interface SkipRequest {
  id: string;
  songName: string;
  nickname: string;
  requestedBy: string;
  requestedAt: number;
}

export interface RoomState {
  id: string;
  name: string;
  hasPassword?: boolean;
  isLocked?: boolean;
  muteAll?: boolean;
  mutedUserIds?: string[];
  /** 仅加入时由服务端按当前用户计算；广播更新请用 isChatMutedForUser */
  chatMuted?: boolean;
  ownerId: string | null;
  /** 房间初创房主（永久身份，唯一显示「房主」） */
  creatorId?: string | null;
  /** 管理员（最多 3 人），可控制播放 */
  adminIds?: string[];
  ownerConnectionId?: string | null;
  queue: QueueItem[];
  current: QueueItem | null;
  isPlaying: boolean;
  currentTime: number;
  users: RoomUser[];
  userCount: number;
  jumpRequests: JumpRequest[];
  skipRequests: SkipRequest[];
  messages?: ChatMessage[];
  /** 非 null 时仅能看到该时间戳之后的消息（首次进入且未发言的新用户） */
  chatVisibleSince?: number | null;
  /** @deprecated 不再随 room_update 广播，由 chatStore 维护 */
  chatHasMore?: boolean;
  /** @deprecated 不再随 room_update 广播，按需 load_song_history */
  songHistory?: SongHistoryItem[];
  /** 服务端正在为空队列拉取私人漫游 */
  randomLoading?: boolean;
  /** 房间播放音质（网易 / QQ） */
  audioQuality?: RoomAudioQuality;
  /** 队列为空时网易云私人漫游模式 */
  neteaseFmMode?: string;
}

/** CRDT 播放状态（服务端唯一时间源） */
export interface PlaybackState {
  roomId: string;
  version: number;
  trackId: string;
  status: 'playing' | 'paused';
  positionSec: number;
  serverNowMs: number;
  startedAt: number;
  currentTime: number;
  updatedAt: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  userCount: number;
  hasPassword: boolean;
  isLocked?: boolean;
  isPlaying: boolean;
  currentSong: { name: string; artist: string } | null;
  queueLength: number;
  createdAt: number;
}

export interface RoomCheckResult {
  exists: boolean;
  hasPassword: boolean;
  isLocked?: boolean;
  name?: string;
}

export interface LyricLine {
  time: number;
  text: string;
  translation?: string;
}

export interface SearchResult extends Song {
  url?: string;
  lrc?: string;
}

export interface FavoriteSong extends Song {
  favoritedAt?: number;
}

export interface HotSongItem extends Song {
  count: number;
  lastRequestedAt?: number;
}
