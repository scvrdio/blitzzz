'use client';

import { useEffect, type ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import { telegram } from '../../lib/telegram/client';
import { GameHeader, type Opponent } from './GameHeader';
import { GameStatus } from './GameStatus';
import { TurnIndicator } from './TurnIndicator';
import { Notice } from '../ui/Notice';
import { GameOutcomeEffect, type GameOutcome } from './GameOutcomeEffect';
import { DevMultiplayerSwitcher } from '../dev/DevMultiplayerSwitcher';

type GameShellProps = {
  title: string;
  playerColor?: 'blue' | 'black';
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

export function GameShell({ title, playerColor = 'blue', opponent, onInvite, notice = null, status = '', statusMuted = false, hero, game, gameInset = true, footer }: GameShellProps) {
  const outcome: GameOutcome | null = status === 'Победа' ? 'win' : status === 'Поражение' ? 'loss' : status === 'Ничья' ? 'draw' : null;
  const activeTurn = status === 'Твой ход' ? 'player' : status === 'Ход соперника' ? 'opponent' : null;

  useEffect(() => {
    const root = document.documentElement;
    const applyColors = () => {
      const styles = getComputedStyle(root);
      const headerColor = styles.getPropertyValue(playerColor === 'blue' ? '--color-primary' : '--color-foreground').trim();
      const backgroundColor = styles.getPropertyValue('--color-background').trim();
      root.style.setProperty('--active-game-color', headerColor);
      telegram.setHeaderColor(headerColor);
      telegram.setBackgroundColor(backgroundColor);
    };

    applyColors();
    window.addEventListener('blitzzz-theme-change', applyColors);
    return () => {
      window.removeEventListener('blitzzz-theme-change', applyColors);
      root.style.removeProperty('--active-game-color');
      const backgroundColor = getComputedStyle(root).getPropertyValue('--color-background').trim();
      telegram.setHeaderColor(backgroundColor);
      telegram.setBackgroundColor(backgroundColor);
    };
  }, [playerColor]);

  return (
    <main className={`game-screen game-screen--${playerColor}`} aria-label={`Игра ${title}`}>
      <GameHeader title={title} opponent={opponent} onInvite={onInvite} />
      <div className="game-content">
        <section className="game-layout">
          {hero ?? (activeTurn ? <TurnIndicator opponent={opponent} active={activeTurn} color={statusMuted ? 'black' : 'blue'} /> : <GameStatus muted={statusMuted}>{status}</GameStatus>)}
          <section className={classNames('game-slot', gameInset && 'game-slot--inset', outcome && `game-slot--${outcome}`)}>
            {game}
            <GameOutcomeEffect outcome={outcome} />
          </section>
        </section>
        {footer}
      </div>
      <Notice message={notice} />
      <DevMultiplayerSwitcher />
    </main>
  );
}
