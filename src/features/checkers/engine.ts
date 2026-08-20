export type CheckerColor = 'blue' | 'black';
export type CheckerPiece = CheckerColor | `${CheckerColor}-king`;
export type CheckerCell = CheckerPiece | null;
export type CheckerMove = { from: number; to: number; capture: number | null };

export const blueStart = [40,42,44,46,49,51,53,55,56,58,60,62] as const;
export const blackStart = [1,3,5,7,8,10,12,14,17,19,21,23] as const;

const row = (index: number) => Math.floor(index / 8);
const inside = (nextRow: number, column: number) => nextRow >= 0 && nextRow < 8 && column >= 0 && column < 8;

export function checkerColor(piece: CheckerCell): CheckerColor | null {
  return piece?.replace('-king', '') as CheckerColor | null;
}

export function isKing(piece: CheckerCell) {
  return piece?.endsWith('-king') ?? false;
}

export function initialCheckersBoard(): CheckerCell[] {
  const board = Array<CheckerCell>(64).fill(null);
  blueStart.forEach((index) => { board[index] = 'blue'; });
  blackStart.forEach((index) => { board[index] = 'black'; });
  return board;
}

export function pieceMoves(index: number, capturesOnly: boolean, board: readonly CheckerCell[]): CheckerMove[] {
  const piece = board[index];
  if (!piece) return [];
  const pieceRow = row(index);
  const column = index % 8;
  const directions = isKing(piece) ? [-1, 1] : checkerColor(piece) === 'blue' ? [-1] : [1];
  const moves: CheckerMove[] = [];
  for (const rowDirection of directions) {
    for (const columnDirection of [-1, 1]) {
      const nearRow = pieceRow + rowDirection;
      const nearColumn = column + columnDirection;
      if (!inside(nearRow, nearColumn)) continue;
      const near = nearRow * 8 + nearColumn;
      if (!board[near] && !capturesOnly) moves.push({ from: index, to: near, capture: null });
      const farRow = pieceRow + rowDirection * 2;
      const farColumn = column + columnDirection * 2;
      if (inside(farRow, farColumn) && board[near] && checkerColor(board[near]) !== checkerColor(piece)) {
        const far = farRow * 8 + farColumn;
        if (!board[far]) moves.push({ from: index, to: far, capture: near });
      }
    }
  }
  return capturesOnly ? moves.filter((move) => move.capture !== null) : moves;
}

export function legalMoves(color: CheckerColor, board: readonly CheckerCell[], only: number | null = null) {
  const pieces = only === null ? board.map((_, index) => index) : [only];
  const moves = pieces.flatMap((index) => checkerColor(board[index]) === color ? pieceMoves(index, false, board) : []);
  const captures = moves.filter((move) => move.capture !== null);
  return captures.length ? captures : moves;
}

export function applyCheckerMove(board: readonly CheckerCell[], move: CheckerMove) {
  const next = [...board];
  const piece = next[move.from];
  next[move.from] = null;
  next[move.to] = piece;
  if (move.capture !== null) next[move.capture] = null;
  if (next[move.to] === 'blue' && row(move.to) === 0) next[move.to] = 'blue-king';
  if (next[move.to] === 'black' && row(move.to) === 7) next[move.to] = 'black-king';
  return next;
}

type MoveSequence = CheckerMove[];

function turnSequences(color: CheckerColor, board: readonly CheckerCell[], only: number | null = null, prefix: MoveSequence = []): MoveSequence[] {
  const moves = legalMoves(color, board, only);
  if (!moves.length) return prefix.length ? [prefix] : [];
  return moves.flatMap((move) => {
    const next = applyCheckerMove(board, move);
    const follow = move.capture === null ? [] : pieceMoves(move.to, true, next);
    return follow.length ? turnSequences(color, next, move.to, [...prefix, move]) : [[...prefix, move]];
  });
}

function positionScore(board: readonly CheckerCell[]) {
  return board.reduce((total, piece, index) => {
    if (!piece) return total;
    const sign = checkerColor(piece) === 'black' ? 1 : -1;
    const advance = checkerColor(piece) === 'black' ? row(index) : 7 - row(index);
    const column = index % 8;
    const center = column >= 2 && column <= 5 ? 4 : 0;
    const edge = column === 0 || column === 7 ? -3 : 0;
    return total + sign * ((isKing(piece) ? 190 : 100) + advance * 6 + center + edge);
  }, 0);
}

function sequenceScore(sequence: MoveSequence) {
  const lastColumn = sequence.at(-1)?.to ?? 0;
  return sequence.reduce((score, move, index) => score + (move.capture === null ? 0 : 80) + (index ? 18 : 0), 0) + (lastColumn % 8 >= 2 && lastColumn % 8 <= 5 ? 5 : 0);
}

function orderedSequences(color: CheckerColor, board: readonly CheckerCell[], only: number | null = null) {
  return turnSequences(color, board, only).sort((a, b) => sequenceScore(b) - sequenceScore(a));
}

function minimax(board: readonly CheckerCell[], color: CheckerColor, depth: number, alpha = -Infinity, beta = Infinity): number {
  if (depth === 0) return positionScore(board);
  const sequences = orderedSequences(color, board);
  if (!sequences.length) return color === 'black' ? -100_000 - depth : 100_000 + depth;
  if (color === 'black') {
    let best = -Infinity;
    for (const sequence of sequences) {
      best = Math.max(best, minimax(sequence.reduce(applyCheckerMove, [...board]), 'blue', depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const sequence of sequences) {
    best = Math.min(best, minimax(sequence.reduce(applyCheckerMove, [...board]), 'black', depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseBotMove(board: readonly CheckerCell[], difficulty: number, only: number | null = null) {
  const moves = legalMoves('black', board, only);
  if (!moves.length) return null;
  if (difficulty === 0) return moves[Math.floor(Math.random() * moves.length)];
  const pieceCount = board.filter(Boolean).length;
  const depths = [0, 1, pieceCount > 16 ? 2 : 3, pieceCount > 16 ? 3 : 4, pieceCount > 16 ? 4 : 5];
  const depth = depths[difficulty] ?? 2;
  const sequences = orderedSequences('black', board, only).filter((sequence) => moves.some((move) => move.from === sequence[0]?.from && move.to === sequence[0]?.to));
  let best = sequences[0];
  let bestScore = -Infinity;
  for (const sequence of sequences) {
    const next = sequence.reduce(applyCheckerMove, [...board]);
    const score = (depth === 1 ? positionScore(next) : minimax(next, 'blue', depth - 1)) + sequenceScore(sequence);
    if (score > bestScore) { bestScore = score; best = sequence; }
  }
  return best?.[0] ?? moves[0];
}
