export const gameIds = ['four-in-a-row', 'checkers', 'tic-tac-toe', 'sea-battle', 'chapayev', 'quoridor'] as const;

export type GameId = (typeof gameIds)[number];
export type GamePreviewKind = GameId;

export type GameDefinition = {
  id: GamePreviewKind;
  title: string;
  description: string;
  href?: `/games/${GameId}`;
  startPrefix?: 'game_' | 'checkers_' | 'tic_tac_toe' | 'sea_battle_' | 'chapayev' | 'quoridor';
};

export const games: readonly GameDefinition[] = [
  {
    id: 'four-in-a-row',
    title: 'Четыре в ряд',
    description: 'Собери четыре фишки в линию',
    href: '/games/four-in-a-row',
    startPrefix: 'game_',
  },
  {
    id: 'tic-tac-toe',
    title: 'Крестики-нолики',
    description: 'Выстрой три своих знака в ряд',
    href: '/games/tic-tac-toe',
    startPrefix: 'tic_tac_toe',
  },
  {
    id: 'sea-battle',
    title: 'Морской бой',
    description: 'Найди и потопи корабли',
    href: '/games/sea-battle',
    startPrefix: 'sea_battle_',
  },
  {
    id: 'checkers',
    title: 'Шашки',
    description: 'Забери все шашки',
    href: '/games/checkers',
    startPrefix: 'checkers_',
  },
  { id: 'quoridor', title: 'Коридор', description: 'Дойди до края поля первым', href: '/games/quoridor', startPrefix: 'quoridor' },
  { id: 'chapayev', title: 'Чапаева', description: 'Сбей все шашки', href: '/games/chapayev', startPrefix: 'chapayev' },
] as const;

export function gamePathFromStartParam(startParam?: string | null): string | null {
  if (!startParam) return null;
  const game = games.find((item) => item.href && item.startPrefix && startParam.startsWith(item.startPrefix));
  if (!game?.href || !game.startPrefix) return null;
  const room = startParam.slice(game.startPrefix.length);
  return room ? `${game.href}?room=${encodeURIComponent(room)}` : game.href;
}
