import type { Opponent } from './GameHeader';

type TurnIndicatorProps = {
  opponent?: Opponent;
  active: 'player' | 'opponent';
  color: 'blue' | 'black';
};

export function TurnIndicator({ active, color }: TurnIndicatorProps) {
  const playerActive = active === 'player';
  const playerColor = playerActive ? color : color === 'blue' ? 'black' : 'blue';
  const opponentColor = playerColor === 'blue' ? 'black' : 'blue';
  return (
    <div className="turn-indicator" aria-label={playerActive ? 'Ваш ход' : 'Ход соперника'}>
      <span className={`turn-indicator__dot turn-indicator__dot--${playerColor}${playerActive ? '' : ' is-inactive'}`} aria-hidden="true" />
      <span className={`turn-indicator__dot turn-indicator__dot--${opponentColor}${playerActive ? ' is-inactive' : ''}`} aria-hidden="true" />
    </div>
  );
}
