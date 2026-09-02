import type { Opponent } from './GameHeader';

type TurnIndicatorProps = {
  opponent?: Opponent;
  active: 'player' | 'opponent';
  color: 'blue' | 'black';
};

export function TurnIndicator({ active, color }: TurnIndicatorProps) {
  const playerActive = active === 'player';
  const blueActive = color === 'blue';
  return (
    <div className="turn-indicator" aria-label={playerActive ? 'Ваш ход' : 'Ход соперника'}>
      <span className={`turn-indicator__dot turn-indicator__dot--blue${blueActive ? '' : ' is-inactive'}`} aria-hidden="true" />
      <span className={`turn-indicator__dot turn-indicator__dot--black${blueActive ? ' is-inactive' : ''}`} aria-hidden="true" />
    </div>
  );
}
