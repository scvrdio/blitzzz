'use client';

/* Exact vectors exported from the shared Figma header. */
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { telegram } from '../../lib/telegram/client';

export type Opponent = { name: string; avatar?: string };

type GameHeaderProps = {
  title: string;
  opponent?: Opponent;
  onInvite: () => void | Promise<void>;
};

export function GameHeader({ title, opponent = { name: 'Соперник Робот' }, onInvite }: GameHeaderProps) {
  return (
    <header className="game-header">
      <Button className="game-header__invite" variant="surface" size="icon" aria-label="Пригласить друга" onClick={() => void onInvite()}>
        <img src="/icons/header-invite.svg" width="16" height="16" alt="" />
      </Button>
      <h1 className="game-header__title">{title}</h1>
      <div className="player-badge">
        {opponent.avatar && <Avatar name={opponent.name} src={opponent.avatar} size={18} />}
        <span>{opponent.name}</span>
      </div>
      <Link className="game-header__exit" href="/" aria-label="Вернуться на главную" onClick={() => telegram.impact('light')}>
        <img src="/icons/header-close.svg" width="44" height="44" alt="" />
      </Link>
    </header>
  );
}
