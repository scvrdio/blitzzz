export const gameIds = ['four-in-a-row', 'checkers', 'tic-tac-toe', 'sea-battle', 'chapayev', 'quoridor'] as const;

export type GameId = (typeof gameIds)[number];
export type GamePreviewKind = GameId;

export type GameDefinition = {
  id: GamePreviewKind;
  title: string;
  description: string;
  duration: string;
  href?: `/games/${GameId}`;
  startPrefix?: 'game_' | 'checkers_' | 'tic_tac_toe' | 'sea_battle_' | 'chapayev' | 'quoridor';
};

export const games: readonly GameDefinition[] = [
  {
    id: 'sea-battle',
    title: 'Морской бой',
    description: 'Стреляйте наугад —\nэто стратегия.',
    duration: '5-10 мин',
    href: '/games/sea-battle',
    startPrefix: 'sea_battle_',
  },
  {
    id: 'checkers',
    title: 'Шашки',
    description: 'Никаких коней, слонов\nи вот этого всего.',
    duration: '5-15 мин',
    href: '/games/checkers',
    startPrefix: 'checkers_',
  },
  {
    id: 'four-in-a-row',
    title: 'Четыре в ряд',
    description: 'Как три в ряд,\nтолько четыре.',
    duration: '<1 мин',
    href: '/games/four-in-a-row',
    startPrefix: 'game_',
  },
  {
    id: 'quoridor',
    title: 'Коридор',
    description: 'Двигайте кружочки,\nставьте стеночки...',
    duration: '<5 мин',
    href: '/games/quoridor',
    startPrefix: 'quoridor',
  },
  {
    id: 'chapayev',
    title: 'Чапаева',
    description: 'Выбивайте шашки.\nЖелательно не свои.',
    duration: '5-10 мин',
    href: '/games/chapayev',
    startPrefix: 'chapayev',
  },
  {
    id: 'tic-tac-toe',
    title: 'Крестики-нолики',
    description: 'Всего девять клеток,\nразберётесь.',
    duration: '<1 мин',
    href: '/games/tic-tac-toe',
    startPrefix: 'tic_tac_toe',
  },
] as const;

export function gamePathFromStartParam(startParam?: string | null): string | null {
  if (!startParam) return null;
  const game = games.find((item) => item.href && item.startPrefix && startParam.startsWith(item.startPrefix));
  if (!game?.href || !game.startPrefix) return null;
  const room = startParam.slice(game.startPrefix.length);
  return room ? `${game.href}?room=${encodeURIComponent(room)}` : game.href;
}
