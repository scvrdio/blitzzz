import { Avatar } from './Avatar';

type PlayerBadgeProps = {
  name: string;
  avatar?: string;
  label?: string;
};

export function PlayerBadge({ name, avatar, label }: PlayerBadgeProps) {
  return (
    <div className="player-badge">
      {label && <span>{label}</span>}
      {avatar && <Avatar name={name} src={avatar} size={20} />}
      <span>{name}</span>
    </div>
  );
}
