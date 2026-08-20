export const connectFourRows = 6;
export const connectFourColumns = 7;

export type Chip = 'blue' | 'black';
export type ConnectFourCell = Chip | null;
export type ConnectFourBoard = ConnectFourCell[][];
export type BoardPosition = readonly [row: number, column: number];

export function emptyConnectFourBoard(): ConnectFourBoard {
  return Array.from({ length: connectFourRows }, () => Array<ConnectFourCell>(connectFourColumns).fill(null));
}

export function firstOpenRow(board: readonly (readonly ConnectFourCell[])[], column: number) {
  for (let row = connectFourRows - 1; row >= 0; row -= 1) if (!board[row]?.[column]) return row;
  return -1;
}

export function availableColumns(board: readonly (readonly ConnectFourCell[])[]) {
  return Array.from({ length: connectFourColumns }, (_, column) => column).filter((column) => firstOpenRow(board, column) !== -1);
}

export function placeChip(board: readonly (readonly ConnectFourCell[])[], column: number, chip: Chip) {
  const row = firstOpenRow(board, column);
  if (row < 0) return null;
  const next = board.map((currentRow) => [...currentRow]);
  next[row][column] = chip;
  return { board: next, row };
}

export function findWinningLine(board: readonly (readonly ConnectFourCell[])[], row: number, column: number, chip: Chip): BoardPosition[] | null {
  for (const [rowStep, columnStep] of [[0,1],[1,0],[1,1],[1,-1]] as const) {
    const line: BoardPosition[] = [[row, column]];
    for (const sign of [-1, 1] as const) {
      for (let distance = 1; ; distance += 1) {
        const nextRow = row + rowStep * distance * sign;
        const nextColumn = column + columnStep * distance * sign;
        if (nextRow < 0 || nextRow >= connectFourRows || nextColumn < 0 || nextColumn >= connectFourColumns || board[nextRow]?.[nextColumn] !== chip) break;
        if (sign < 0) line.unshift([nextRow, nextColumn]); else line.push([nextRow, nextColumn]);
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function wouldWin(board: ConnectFourBoard, column: number, chip: Chip) {
  const placed = placeChip(board, column, chip);
  return Boolean(placed && findWinningLine(placed.board, placed.row, column, chip));
}

function longestLineAt(board: ConnectFourBoard, row: number, column: number, chip: Chip) {
  let longest = 1;
  for (const [rowStep, columnStep] of [[0,1],[1,0],[1,1],[1,-1]] as const) {
    let length = 1;
    for (const sign of [-1, 1] as const) {
      for (let distance = 1; ; distance += 1) {
        const nextRow = row + rowStep * distance * sign;
        const nextColumn = column + columnStep * distance * sign;
        if (nextRow < 0 || nextRow >= connectFourRows || nextColumn < 0 || nextColumn >= connectFourColumns || board[nextRow]?.[nextColumn] !== chip) break;
        length += 1;
      }
    }
    longest = Math.max(longest, length);
  }
  return longest;
}

export function chooseRobotColumn(board: ConnectFourBoard) {
  const options = availableColumns(board);
  const winning = options.find((column) => wouldWin(board, column, 'black'));
  if (winning !== undefined) return winning;
  const blocking = options.find((column) => wouldWin(board, column, 'blue'));
  if (blocking !== undefined) return blocking;
  if (board.flat().filter(Boolean).length <= 1) {
    const opening = options.filter((column) => column >= 1 && column <= 5);
    const pool = opening.length ? opening : options;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const scores = options.map((column) => {
    const placed = placeChip(board, column, 'black');
    if (!placed) return [column, -Infinity] as const;
    const blackThreats = availableColumns(placed.board).filter((next) => wouldWin(placed.board, next, 'black')).length;
    const blueThreats = availableColumns(placed.board).filter((next) => wouldWin(placed.board, next, 'blue')).length;
    return [column, blackThreats * 60 - blueThreats * 90 + longestLineAt(placed.board, placed.row, column, 'black') * 12 + 3 - Math.abs(3 - column)] as const;
  });
  const best = Math.max(...scores.map(([, score]) => score));
  const candidates = scores.filter(([, score]) => score >= best - 1).map(([column]) => column);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function boardChange(previous: ConnectFourBoard, next: ConnectFourBoard) {
  for (let row = 0; row < connectFourRows; row += 1) {
    for (let column = 0; column < connectFourColumns; column += 1) {
      const chip = next[row]?.[column];
      if (previous[row]?.[column] !== chip && chip) return { row, column, chip };
    }
  }
  return null;
}
