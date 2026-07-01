import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import type { Song } from '../types';
import { useFavorites } from '../hooks/useFavorites';
import Tooltip from './Tooltip';

interface Props {
  song: Song | null;
  className?: string;
  iconClassName?: string;
  titlePrefix?: string;
  /** 列表项中悬停时才显示 */
  showOnHover?: boolean;
  /** 由父级传入时可避免列表行重复订阅收藏状态 */
  favorited?: boolean;
}

export default function FavoriteButton({
  song,
  className = 'w-8 h-8 text-netease-muted hover:text-rose-300',
  iconClassName = 'w-4 h-4',
  titlePrefix = '',
  showOnHover = false,
  favorited: favoritedProp,
}: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const favorited = favoritedProp ?? isFavorite(song);

  const handleToggle = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!song || loading) return;
    setLoading(true);
    setError('');
    const res = await toggleFavorite(song);
    setLoading(false);
    if (!res.success) {
      setError(res.error || '收藏失败');
    }
  };

  const hoverClass = showOnHover ? 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100' : '';

  const tip = error || `${titlePrefix}${favorited ? '取消收藏' : '收藏'}`;

  return (
    <Tooltip content={tip}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!song || loading}
        className={`flex flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${favorited ? 'text-rose-300' : ''} ${hoverClass} ${className}`}
        aria-label={favorited ? '取消收藏' : '收藏'}
      >
        {loading ? (
          <Loader2 className={`${iconClassName} animate-spin`} />
        ) : (
          <Heart className={`${iconClassName} ${favorited ? 'fill-current' : ''}`} />
        )}
      </button>
    </Tooltip>
  );
}
