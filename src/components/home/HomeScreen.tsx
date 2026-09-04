'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { gamePathFromStartParam, games } from '../../config/games';
import { telegram } from '../../lib/telegram/client';
import { useNotice } from '../../hooks/use-notice';
import { useTelegramProfile } from '../../hooks/use-telegram-profile';
import { GameHeader } from '../game/GameHeader';
import { Notice } from '../ui/Notice';
import { PlayerBadge } from '../ui/PlayerBadge';
import { ThemeToggle } from '../ui/ThemeToggle';
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

  useEffect(() => {
    const destinations = games.flatMap((game) => game.href ? [game.href] : []);
    const prefetch = () => destinations.forEach((destination) => router.prefetch(destination));
    const idle = window.requestIdleCallback?.(prefetch, { timeout: 1200 });
    if (idle !== undefined) return () => window.cancelIdleCallback?.(idle);
    const timer = window.setTimeout(prefetch, 350);
    return () => window.clearTimeout(timer);
  }, [router]);

  const showUnavailable = () => {
    telegram.impact('light');
    notice.show('Игра появится скоро');
  };

  return (
    <main className="home-screen">
      <GameHeader
        className="home-header"
        title="Blitz"
        badge={<PlayerBadge name={profile?.name || 'Игрок'} avatar={profile?.photoUrl} />}
        leading={<ThemeToggle />}
      />
      <section className="game-list" aria-label="Игры">
        {games.map((game) => <GameCard key={game.id} game={game} onUnavailable={showUnavailable} />)}
      </section>
      <Notice message={notice.message} />
    </main>
  );
}
