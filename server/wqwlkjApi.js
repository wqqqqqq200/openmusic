const WQWL_RANDOM_API_URL =
  process.env.WQWL_RANDOM_API_URL ||
  'https://free.wqwlkj.cn/wqwlapi/wyy_random.php?type=json';

const MAX_RANDOM_RETRIES = 20;

/** 随机推荐是否可播放：歌名须含中文，排除纯英文/日文/韩文 */
export function shouldPlayRandomSong(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;

  if (!/[\u4e00-\u9fff\u3400-\u4dbf]/.test(trimmed)) return false;
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(trimmed)) return false;
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(trimmed)) return false;

  return true;
}

async function fetchRandomSongOnce() {
  try {
    const response = await fetch(WQWL_RANDOM_API_URL);
    if (!response.ok) return null;

    const json = await response.json();
    if (json.code !== 1 || !json.data?.id) return null;

    const { data } = json;
    return {
      id: String(data.id),
      source: 'netease',
      name: data.name || '未知歌曲',
      artist: data.artistsname || '未知歌手',
      album: data.alname || '',
      pic: data.picurl || '',
    };
  } catch (err) {
    console.error('Random song API error:', err.message);
    return null;
  }
}

export async function fetchRandomSong() {
  for (let i = 0; i < MAX_RANDOM_RETRIES; i++) {
    const song = await fetchRandomSongOnce();
    if (!song) return null;
    if (shouldPlayRandomSong(song.name)) return song;
  }
  return null;
}
