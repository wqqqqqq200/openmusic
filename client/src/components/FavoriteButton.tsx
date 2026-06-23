import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import type { Song } from '../types';
import { useFavorites } from '../hooks/useFavorites';

interface Props {
  song: Song | null;
  className?: string;
  iconClassName?: string;
  titlePrefix?: string;
  /** 列表项中悬停时才显示 */
  showOnHover?: boolean;
}

export default function FavoriteButton({
  song,
  className = 'w-8 h-8 text-netease-muted hover:text-rose-300',
  iconClassName = 'w-4 h-4',
  titlePrefix = '',
  showOnHover = false,
}: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const favorited = isFavorite(song);

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

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!song || loading}
      className={`flex flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${favorited ? 'text-rose-300' : ''} ${hoverClass} ${className}`}
      title={error || `${titlePrefix}${favorited ? '取消收藏' : '收藏'}`}
      aria-label={favorited ? '取消收藏' : '收藏'}
    >
      {loading ? (
        <Loader2 className={`${iconClassName} animate-spin`} />
      ) : (
        <Heart className={`${iconClassName} ${favorited ? 'fill-current' : ''}`} />
      )}
    </button>
  );
}
