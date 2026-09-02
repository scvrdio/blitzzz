import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import { GameHeader, type Opponent } from './GameHeader';
import { GameStatus } from './GameStatus';
import { TurnIndicator } from './TurnIndicator';
import { Notice } from '../ui/Notice';
import { GameOutcomeEffect, type GameOutcome } from './GameOutcomeEffect';
import { DevMultiplayerSwitcher } from '../dev/DevMultiplayerSwitcher';

type GameShellProps = {
  title: string;
  opponent?: Opponent;
  onInvite: () => void | Promise<void>;
  notice?: string | null;
  status?: string;
  statusMuted?: boolean;
  hero?: ReactNode;
  game: ReactNode;
  gameInset?: boolean;
  footer: ReactNode;
};

export function GameShell({ title, opponent, onInvite, notice = null, status = '', statusMuted = false, hero, game, gameInset = true, footer }: GameShellProps) {
  const outcome: GameOutcome | null = status === 'Победа' ? 'win' : status === 'Поражение' ? 'loss' : status === 'Ничья' ? 'draw' : null;
  const activeTurn = status === 'Твой ход' ? 'player' : status === 'Ход соперника' ? 'opponent' : null;
  return (
    <main className="game-screen" aria-label={`Игра ${title}`}>
      <GameHeader title={title} opponent={opponent} onInvite={onInvite} />
      <section className="game-layout">
        {hero ?? (activeTurn ? <TurnIndicator opponent={opponent} active={activeTurn} color={statusMuted ? 'black' : 'blue'} /> : <GameStatus muted={statusMuted}>{status}</GameStatus>)}
        <section className={classNames('game-slot', gameInset && 'game-slot--inset', outcome && `game-slot--${outcome}`)}>
          {game}
          <GameOutcomeEffect outcome={outcome} />
        </section>
      </section>
      {footer}
      <Notice message={notice} />
      <DevMultiplayerSwitcher />
    </main>
  );
}
