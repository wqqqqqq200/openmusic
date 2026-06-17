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
  addedAt: number;
}

export interface RoomUser {
  id: string;
  nickname: string;
  joinedAt: number;
}

export interface JumpRequest {
  id: string;
  queueId: string;
  songName: string;
  nickname: string;
  requestedBy: string;
  requestedAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
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
  ownerId: string | null;
  queue: QueueItem[];
  current: QueueItem | null;
  isPlaying: boolean;
  currentTime: number;
  users: RoomUser[];
  userCount: number;
  jumpRequests: JumpRequest[];
  skipRequests: SkipRequest[];
  messages: ChatMessage[];
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
