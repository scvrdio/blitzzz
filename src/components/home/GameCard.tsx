import Link from 'next/link';
import type { GameDefinition } from '../../config/games';
import { Badge } from '../ui/Badge';
import { GamePreview } from './GamePreview';

type GameCardProps = { game: GameDefinition; onUnavailable: () => void };

export function GameCard({ game, onUnavailable }: GameCardProps) {
  const content = <><span className="game-card__copy"><strong>{game.title}</strong><span>{game.description}</span></span><GamePreview kind={game.id} />{!game.href && <Badge>скоро</Badge>}</>;
  if (game.href) return <Link className="game-card" href={game.href}>{content}</Link>;
  return <button className="game-card game-card--disabled" type="button" onClick={onUnavailable}>{content}</button>;
}
