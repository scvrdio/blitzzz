export const gameIds = ['four-in-a-row', 'checkers', 'tic-tac-toe'] as const;

export type GameId = (typeof gameIds)[number];
export type GamePreviewKind = GameId | 'sea-battle' | 'quoridor' | 'chapayev';

export type GameDefinition = {
  id: GamePreviewKind;
  title: string;
  description: string;
  href?: `/games/${GameId}`;
  startPrefix?: 'game_' | 'checkers_' | 'tic_tac_toe';
};

export const games: readonly GameDefinition[] = [
  {
    id: 'four-in-a-row',
    title: 'Четыре в ряд',
    description: 'Собери четыре фишки\nв линию раньше соперника',
    href: '/games/four-in-a-row',
    startPrefix: 'game_',
  },
  {
    id: 'checkers',
    title: 'Шашки',
    description: 'Забери все шашки соперника\nили заблокируй его ходы',
    href: '/games/checkers',
    startPrefix: 'checkers_',
  },
  {
    id: 'tic-tac-toe',
    title: 'Крестики-нолики',
    description: 'Выстрой три своих знака в ряд',
    href: '/games/tic-tac-toe',
    startPrefix: 'tic_tac_toe',
  },
  { id: 'sea-battle', title: 'Морской бой', description: 'Найди и потопи корабли соперника' },
  { id: 'quoridor', title: 'Коридор', description: 'Дойди до края поля первым,\nзадерживая противника стенами' },
  { id: 'chapayev', title: 'Чапаева', description: 'Выбей фишки соперника\nи дойди первым до края поля' },
] as const;

export function gamePathFromStartParam(startParam?: string | null): string | null {
  if (!startParam) return null;
  const game = games.find((item) => item.href && item.startPrefix && startParam.startsWith(item.startPrefix));
  if (!game?.href || !game.startPrefix) return null;
  const room = startParam.slice(game.startPrefix.length);
  return room ? `${game.href}?room=${encodeURIComponent(room)}` : game.href;
}
