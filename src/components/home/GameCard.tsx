'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GameDefinition } from '../../config/games';
import { telegram } from '../../lib/telegram/client';
import { Badge } from '../ui/Badge';

type GameCardProps = { game: GameDefinition; onUnavailable: () => void };

const gameIcons: Record<GameDefinition['id'], string> = {
  'four-in-a-row': '/game-icons/four-in-a-row.svg',
  'tic-tac-toe': '/game-icons/tic-tac-toe.svg',
  'sea-battle': '/game-icons/sea-battle.svg',
  checkers: '/game-icons/checkers.svg',
  quoridor: '/game-icons/quoridor.svg',
  chapayev: '/game-icons/chapayev.svg',
};

export function GameCard({ game, onUnavailable }: GameCardProps) {
  const router = useRouter();
  const content = <>
    <span className="game-card__visual" aria-hidden="true">
      <img src={gameIcons[game.id]} alt="" />
    </span>
    <span className="game-card__copy">
      <strong>{game.title}</strong>
      <span>{game.description}</span>
      <time>{game.duration}</time>
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
