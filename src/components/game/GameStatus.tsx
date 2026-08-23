import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';

export function GameStatus({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <div className={classNames('game-status', muted && 'game-status--muted')} aria-live="polite">{children}</div>;
}
