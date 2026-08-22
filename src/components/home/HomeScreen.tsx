'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { gamePathFromStartParam, games } from '../../config/games';
import { telegram } from '../../lib/telegram/client';
import { useNotice } from '../../hooks/use-notice';
import { useTelegramProfile } from '../../hooks/use-telegram-profile';
import { Notice } from '../ui/Notice';
import { PlayerBadge } from '../ui/PlayerBadge';
import { GameCard } from './GameCard';

export function HomeScreen() {
  const router = useRouter();
  const profile = useTelegramProfile();
  const notice = useNotice(1800);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destination = gamePathFromStartParam(telegram.startParam ?? params.get('tgWebAppStartParam'));
    if (destination) router.replace(destination);
  }, [router]);

  const showUnavailable = () => {
    telegram.impact('light');
    notice.show('Игра появится скоро');
  };

  return (
    <main className="home-screen">
      <header className="home-header">
        <h1 className="home-header__title">Blitzzz</h1>
        <PlayerBadge name={profile?.name || 'Игрок'} avatar={profile?.photoUrl} />
      </header>
      <section className="game-list" aria-label="Игры">
        {games.map((game) => <GameCard key={game.id} game={game} onUnavailable={showUnavailable} />)}
      </section>
      <Notice message={notice.message} />
    </main>
  );
}
