export type Side = 'blue' | 'black';
export type Position = { row: number; col: number };
export type Wall = { row: number; col: number; orientation: 'horizontal' | 'vertical'; side?: Side };
export type GameState = { blue: Position; black: Position; walls: Wall[] };

const size = 9;
const inside = ({ row, col }: Position) => row >= 0 && row < size && col >= 0 && col < size;
const equal = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

function blocks(a: Position, b: Position, walls: readonly Wall[]) {
  if (a.row === b.row) {
    const row = a.row;
    const col = Math.min(a.col, b.col);
    return walls.some((wall) => wall.orientation === 'vertical' && wall.col === col && (wall.row === row || wall.row + 1 === row));
  }
  const row = Math.min(a.row, b.row);
  const col = a.col;
  return walls.some((wall) => wall.orientation === 'horizontal' && wall.row === row && (wall.col === col || wall.col + 1 === col));
}

export function adjacent(position: Position, walls: readonly Wall[]) {
  return [{ row: position.row - 1, col: position.col }, { row: position.row + 1, col: position.col }, { row: position.row, col: position.col - 1 }, { row: position.row, col: position.col + 1 }]
    .filter(inside)
    .filter((next) => !blocks(position, next, walls));
}

export function legalMoves(state: GameState, side: Side) {
  const from = state[side];
  const opponent = state[side === 'blue' ? 'black' : 'blue'];
  return adjacent(from, state.walls).flatMap((next) => {
    if (!equal(next, opponent)) return [next];
    const rowDelta = opponent.row - from.row;
    const colDelta = opponent.col - from.col;
    const jump = { row: opponent.row + rowDelta, col: opponent.col + colDelta };
    if (inside(jump) && !blocks(opponent, jump, state.walls)) return [jump];
    const sideways = rowDelta
      ? [{ row: opponent.row, col: opponent.col - 1 }, { row: opponent.row, col: opponent.col + 1 }]
      : [{ row: opponent.row - 1, col: opponent.col }, { row: opponent.row + 1, col: opponent.col }];
    return sideways.filter(inside).filter((candidate) => !blocks(opponent, candidate, state.walls));
  });
}

export function hasPath(state: GameState, side: Side) {
  const start = state[side];
  const finishRow = side === 'blue' ? 0 : size - 1;
  const queue = [start];
  const seen = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.row === finishRow) return true;
    adjacent(current, state.walls).forEach((next) => {
      const key = `${next.row}:${next.col}`;
      if (!seen.has(key)) { seen.add(key); queue.push(next); }
    });
  }
  return false;
}

export function canPlaceWall(state: GameState, wall: Wall) {
  if (wall.row < 0 || wall.row > 7 || wall.col < 0 || wall.col > 7) return false;
  if (state.walls.some((item) => {
    if (item.orientation !== wall.orientation) return item.row === wall.row && item.col === wall.col;
    return item.orientation === 'horizontal'
      ? item.row === wall.row && Math.abs(item.col - wall.col) <= 1
      : item.col === wall.col && Math.abs(item.row - wall.row) <= 1;
  })) return false;
  const next = { ...state, walls: [...state.walls, wall] };
  return hasPath(next, 'blue') && hasPath(next, 'black');
}

export function distanceToGoal(state: GameState, side: Side) {
  const start = state[side];
  const finishRow = side === 'blue' ? 0 : size - 1;
  const queue: Array<{ position: Position; distance: number }> = [{ position: start, distance: 0 }];
  const seen = new Set([`${start.row}:${start.col}`]);
  while (queue.length) {
    const { position, distance } = queue.shift()!;
    if (position.row === finishRow) return distance;
    adjacent(position, state.walls).forEach((next) => {
      const key = `${next.row}:${next.col}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ position: next, distance: distance + 1 }); }
    });
  }
  return Infinity;
}

export const initialState = (): GameState => ({ blue: { row: 8, col: 4 }, black: { row: 0, col: 4 }, walls: [] });
