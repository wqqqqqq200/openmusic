import { Users, Crown } from 'lucide-react';
import type { RoomUser } from '../types';

interface Props {
  users: RoomUser[];
  ownerId?: string | null;
}

export default function OnlineUsers({ users, ownerId }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Users className="w-4 h-4 text-netease-muted" />
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((user) => (
          <div
            key={user.id}
            title={user.id === ownerId ? `${user.nickname}（房主）` : user.nickname}
            className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-netease-dark ${
              user.id === ownerId
                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                : 'bg-gradient-to-br from-netease-red to-pink-500'
            }`}
          >
            {user.nickname.charAt(0).toUpperCase()}
            {user.id === ownerId && (
              <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-300" />
            )}
          </div>
        ))}
        {users.length > 5 && (
          <div className="w-7 h-7 rounded-full bg-netease-card flex items-center justify-center text-[10px] text-netease-muted border-2 border-netease-dark">
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
