import type { ReactNode } from 'react';
import { GameHeader, type Opponent } from './GameHeader';
import { Notice } from '../ui/Notice';

type GameShellProps = {
  title: string;
  opponent?: Opponent;
  onInvite: () => void | Promise<void>;
  notice?: string | null;
  children: ReactNode;
};

export function GameShell({ title, opponent, onInvite, notice = null, children }: GameShellProps) {
  return (
    <main className="game-screen" aria-label={`Игра ${title}`}>
      <GameHeader title={title} opponent={opponent} onInvite={onInvite} />
      {children}
      <Notice message={notice} />
    </main>
  );
}
