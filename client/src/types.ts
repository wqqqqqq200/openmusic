export type MusicSource = 'netease' | 'tencent' | 'kugou';

export interface Song {
  id: string;
  source: MusicSource;
  name: string;
  artist: string;
  album?: string;
  pic?: string;
  duration?: number;
  /** 直链播放地址（QQ cyapi 等） */
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

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  mentions?: ChatMention[];
  replyTo?: ChatReplyRef | null;
  timestamp: number;
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
  ownerId: string | null;
  /** 房间创建者（持久身份，重新进入时恢复房主） */
  creatorId?: string | null;
  ownerConnectionId?: string | null;
  queue: QueueItem[];
  current: QueueItem | null;
  isPlaying: boolean;
  currentTime: number;
  users: RoomUser[];
  userCount: number;
  jumpRequests: JumpRequest[];
  skipRequests: SkipRequest[];
  messages: ChatMessage[];
  songHistory?: SongHistoryItem[];
  /** 服务端正在为空队列拉取随机歌曲 */
  randomLoading?: boolean;
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
  isPlaying: boolean;
  currentSong: { name: string; artist: string } | null;
  queueLength: number;
  createdAt: number;
}

export interface RoomCheckResult {
  exists: boolean;
  hasPassword: boolean;
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
