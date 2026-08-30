'use client';

import Link from 'next/link';
import { AppHeader } from '../layout/AppHeader';
import { Button } from '../ui/Button';
import { PlayerBadge } from '../ui/PlayerBadge';
import { telegram } from '../../lib/telegram/client';

export type Opponent = { name: string; avatar?: string; multiplayer?: boolean };

type GameHeaderProps = {
  title: string;
  opponent?: Opponent;
  onInvite: () => void | Promise<void>;
};

export function GameHeader({ title, opponent = { name: 'Соперник Робот' }, onInvite }: GameHeaderProps) {
  return (
    <AppHeader
      className="game-header"
      title={title}
      badge={<PlayerBadge name={opponent.name} avatar={opponent.avatar} label={opponent.multiplayer ? 'Соперник' : undefined} />}
      leading={<Button className="game-header__invite" variant="surface" size="icon" aria-label="Пригласить друга" onClick={() => void onInvite()}>
        <img src="/icons/header-invite.svg" width="16" height="16" alt="" />
      </Button>}
      trailing={<Link className="game-header__exit button button--surface button--icon" href="/" aria-label="Вернуться на главную" onClick={() => telegram.impact('light')}>
        <img src="/icons/header-close-theme.svg" width="16" height="16" alt="" />
      </Link>}
    />
  );
}
