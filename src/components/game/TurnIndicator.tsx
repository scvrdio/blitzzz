import type { Opponent } from './GameHeader';

type TurnIndicatorProps = {
  opponent?: Opponent;
  active: 'player' | 'opponent';
  color: 'blue' | 'black';
};

type TurnAvatarProps = {
  initial: string;
  color: 'blue' | 'black';
  inactive: boolean;
  label: string;
};

function TurnAvatar({ initial, color, inactive, label }: TurnAvatarProps) {
  return (
    <div className={`turn-indicator__avatar turn-indicator__avatar--${color}${inactive ? ' is-inactive' : ''}`} aria-label={label}>
      <span aria-hidden="true">{initial}</span>
    </div>
  );
}

export function TurnIndicator({ opponent, active, color }: TurnIndicatorProps) {
  const opponentName = opponent?.name || 'Соперник Робот';
  const playerActive = active === 'player';
  const playerColor = playerActive ? color : color === 'blue' ? 'black' : 'blue';
  const opponentColor = playerColor === 'blue' ? 'black' : 'blue';
  const opponentInitial = opponent?.multiplayer ? opponentName.trim().charAt(0).toUpperCase() || 'И' : 'Р';

  return (
    <div className={`turn-indicator turn-indicator--${color}${playerActive ? ' is-player-turn' : ' is-opponent-turn'}`} aria-label={playerActive ? 'Ваш ход' : 'Ход соперника'}>
      <TurnAvatar initial="Я" color={playerColor} inactive={!playerActive} label="Вы" />
      <span className="turn-indicator__arrow" aria-hidden="true" />
      <TurnAvatar initial={opponentInitial} color={opponentColor} inactive={playerActive} label={opponentName} />
    </div>
  );
}
