import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import { GameHeader, type Opponent } from './GameHeader';
import { GameStatus } from './GameStatus';
import { Notice } from '../ui/Notice';

type GameShellProps = {
  title: string;
  opponent?: Opponent;
  onInvite: () => void | Promise<void>;
  notice?: string | null;
  status: string;
  statusMuted?: boolean;
  game: ReactNode;
  gameInset?: boolean;
  footer: ReactNode;
};

export function GameShell({ title, opponent, onInvite, notice = null, status, statusMuted = false, game, gameInset = true, footer }: GameShellProps) {
  return (
    <main className="game-screen" aria-label={`Игра ${title}`}>
      <GameHeader title={title} opponent={opponent} onInvite={onInvite} />
      <section className="game-layout">
        <GameStatus muted={statusMuted}>{status}</GameStatus>
        <section className={classNames('game-slot', gameInset && 'game-slot--inset')}>{game}</section>
      </section>
      {footer}
      <Notice message={notice} />
    </main>
  );
}
