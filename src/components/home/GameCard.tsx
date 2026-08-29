'use client';

import Link from 'next/link';
import type { GameDefinition } from '../../config/games';
import { telegram } from '../../lib/telegram/client';
import { Badge } from '../ui/Badge';

type GameCardProps = { game: GameDefinition; onUnavailable: () => void };

export function GameCard({ game, onUnavailable }: GameCardProps) {
  const content = <><span className="game-card__copy"><strong>{game.title}</strong><span>{game.description}</span></span>{!game.href && <Badge>скоро</Badge>}</>;
  if (game.href) return <Link className="game-card" href={game.href} onClick={() => telegram.impact('light')}>{content}</Link>;
  return <button className="game-card game-card--disabled" type="button" onClick={onUnavailable}>{content}</button>;
}
