'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameDefinition } from '../../config/games';
import { telegram } from '../../lib/telegram/client';
import { Badge } from '../ui/Badge';

type GameCardProps = { game: GameDefinition; onUnavailable: () => void };

const gamePreviews: Record<GameDefinition['id'], string> = {
  'four-in-a-row': '/game-previews/four-in-a-row.png',
  'tic-tac-toe': '/game-previews/tic-tac-toe.png',
  'sea-battle': '/game-previews/sea-battle.png',
  checkers: '/game-previews/checkers.png',
  quoridor: '/game-previews/quoridor.png',
  chapayev: '/game-previews/chapayev.png',
};

export function GameCard({ game, onUnavailable }: GameCardProps) {
  const router = useRouter();
  const content = <>
    <span className="game-card__copy">
      <strong>{game.title}</strong>
      <span>{game.description}</span>
    </span>
    <span className={`game-card__art game-card__art--${game.id}`} aria-hidden="true">
      <img src={gamePreviews[game.id]} alt="" />
    </span>
    {!game.href && <Badge>скоро</Badge>}
  </>;
  const prefetch = () => { if (game.href) router.prefetch(game.href); };
  if (game.href) return (
    <Link
      className="game-card"
      href={game.href}
      onPointerEnter={prefetch}
      onTouchStart={prefetch}
      onClick={() => { prefetch(); telegram.impact('light'); }}
    >
      {content}
    </Link>
  );
  return <button className="game-card game-card--disabled" type="button" onClick={onUnavailable}>{content}</button>;
}
