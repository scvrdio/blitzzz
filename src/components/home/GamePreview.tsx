import type { GamePreviewKind } from '../../config/games';

const previewCells: Partial<Record<GamePreviewKind, number>> = {
  'four-in-a-row': 42,
  'tic-tac-toe': 9,
  'sea-battle': 100,
  quoridor: 100,
};

export function GamePreview({ kind }: { kind: GamePreviewKind }) {
  const count = previewCells[kind];
  if (!count) return null;
  return <div className={`game-preview game-preview--${kind}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}
