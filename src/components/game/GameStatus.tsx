import { classNames } from '../../lib/class-names';

export function GameStatus({ children, muted = false }: { children: string; muted?: boolean }) {
  return <div className={classNames('game-status', muted && 'game-status--muted')} aria-live="polite">{children}</div>;
}
