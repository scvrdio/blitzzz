export const seaBattleSize = 10;

export type ShipSize = 1 | 2 | 3 | 4;
export type Ship = { id: string; size: ShipSize; cells: number[] };
export type Shot = 'miss' | 'hit' | null;
export type ShotBoard = Shot[];
export type FleetCounts = Record<ShipSize, number>;

export const fleetCounts: FleetCounts = { 1: 4, 2: 3, 3: 2, 4: 1 };
export const fleetSizes: readonly ShipSize[] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

export const emptyShots = (): ShotBoard => Array<Shot>(seaBattleSize * seaBattleSize).fill(null);

const row = (index: number) => Math.floor(index / seaBattleSize);
const column = (index: number) => index % seaBattleSize;
const inside = (nextRow: number, nextColumn: number) => nextRow >= 0 && nextRow < seaBattleSize && nextColumn >= 0 && nextColumn < seaBattleSize;

export function remainingFleet(ships: readonly Ship[]): FleetCounts {
  const remaining = { ...fleetCounts };
  ships.forEach((ship) => { remaining[ship.size] -= 1; });
  return remaining;
}

export function largestAvailableShip(ships: readonly Ship[]): ShipSize | 0 {
  const remaining = remainingFleet(ships);
  return ([4, 3, 2, 1] as const).find((size) => remaining[size] > 0) ?? 0;
}

export function placementCells(start: number, current: number, ships: readonly Ship[]) {
  const remaining = remainingFleet(ships);
  const startRow = row(start);
  const startColumn = column(start);
  const currentRow = row(current);
  const currentColumn = column(current);
  const rowDistance = currentRow - startRow;
  const columnDistance = currentColumn - startColumn;
  const horizontal = Math.abs(columnDistance) >= Math.abs(rowDistance);
  const distance = horizontal ? Math.abs(columnDistance) : Math.abs(rowDistance);
  const maximum = largestAvailableShip(ships);
  if (!maximum) return [];
  const requested = Math.min(maximum, distance + 1);
  const size = ([4, 3, 2, 1] as const).find((candidate) => candidate <= requested && remaining[candidate] > 0);
  if (!size) return [];
  const direction = horizontal ? (columnDistance < 0 ? -1 : 1) : (rowDistance < 0 ? -1 : 1);
  return Array.from({ length: size }, (_, offset) => horizontal
    ? startRow * seaBattleSize + startColumn + offset * direction
    : (startRow + offset * direction) * seaBattleSize + startColumn);
}

function isStraight(cells: readonly number[]) {
  if (!cells.length || new Set(cells).size !== cells.length || cells.some((cell) => cell < 0 || cell >= seaBattleSize * seaBattleSize)) return false;
  if (cells.length === 1) return true;
  const rows = new Set(cells.map(row));
  const columns = new Set(cells.map(column));
  if (rows.size !== 1 && columns.size !== 1) return false;
  const values = [...(rows.size === 1 ? cells.map(column) : cells.map(row))].sort((a, b) => a - b);
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

export function canPlaceShip(ships: readonly Ship[], cells: readonly number[]) {
  if (!isStraight(cells) || cells.length > 4) return false;
  const occupied = new Set(ships.flatMap((ship) => ship.cells));
  return cells.every((cell) => {
    const cellRow = row(cell);
    const cellColumn = column(cell);
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const neighbourRow = cellRow + rowOffset;
        const neighbourColumn = cellColumn + columnOffset;
        if (inside(neighbourRow, neighbourColumn) && occupied.has(neighbourRow * seaBattleSize + neighbourColumn)) return false;
      }
    }
    return true;
  });
}

function candidatePlacements(size: ShipSize, ships: readonly Ship[]) {
  const candidates: number[][] = [];
  for (let nextRow = 0; nextRow < seaBattleSize; nextRow += 1) {
    for (let nextColumn = 0; nextColumn < seaBattleSize; nextColumn += 1) {
      for (const horizontal of size === 1 ? [true] : [true, false]) {
        if (horizontal && nextColumn + size > seaBattleSize) continue;
        if (!horizontal && nextRow + size > seaBattleSize) continue;
        const cells = Array.from({ length: size }, (_, offset) => horizontal
          ? nextRow * seaBattleSize + nextColumn + offset
          : (nextRow + offset) * seaBattleSize + nextColumn);
        if (canPlaceShip(ships, cells)) candidates.push(cells);
      }
    }
  }
  return candidates;
}

function shuffled<T>(values: readonly T[], random: () => number) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function randomFleet(random: () => number = Math.random): Ship[] {
  const build = (index: number, ships: Ship[]): Ship[] | null => {
    if (index === fleetSizes.length) return ships;
    const size = fleetSizes[index];
    for (const cells of shuffled(candidatePlacements(size, ships), random)) {
      const solved = build(index + 1, [...ships, { id: `ship-${index}`, size, cells }]);
      if (solved) return solved;
    }
    return null;
  };
  return build(0, []) ?? [];
}

export function shipAt(ships: readonly Ship[], cell: number) {
  return ships.find((ship) => ship.cells.includes(cell));
}

export function isShipSunk(ship: Ship, shots: readonly Shot[]) {
  return ship.cells.every((cell) => shots[cell] === 'hit');
}

export function survivingFleet(ships: readonly Ship[], shots: readonly Shot[]): FleetCounts {
  const surviving: FleetCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  ships.forEach((ship) => {
    if (!isShipSunk(ship, shots)) surviving[ship.size] += 1;
  });
  return surviving;
}

export function allShipsSunk(ships: readonly Ship[], shots: readonly Shot[]) {
  return ships.length === fleetSizes.length && ships.every((ship) => isShipSunk(ship, shots));
}

export function fireAt(ships: readonly Ship[], shots: readonly Shot[], cell: number) {
  if (shots[cell]) return null;
  const next = [...shots];
  const ship = shipAt(ships, cell);
  next[cell] = ship ? 'hit' : 'miss';
  const sunk = ship ? isShipSunk(ship, next) : false;
  if (ship && sunk) {
    ship.cells.forEach((shipCell) => {
      const shipRow = row(shipCell);
      const shipColumn = column(shipCell);
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const nextRow = shipRow + rowOffset;
          const nextColumn = shipColumn + columnOffset;
          if (!inside(nextRow, nextColumn)) continue;
          const neighbour = nextRow * seaBattleSize + nextColumn;
          if (!next[neighbour]) next[neighbour] = 'miss';
        }
      }
    });
  }
  return { shots: next, hit: Boolean(ship), sunk, won: allShipsSunk(ships, next) };
}

export function chooseRobotTarget(ships: readonly Ship[], shots: readonly Shot[], random: () => number = Math.random) {
  const unshot = shots.flatMap((shot, index) => shot ? [] : [index]);
  const woundedNeighbours = ships.flatMap((ship) => {
    if (isShipSunk(ship, shots)) return [];
    const hits = ship.cells.filter((cell) => shots[cell] === 'hit');
    if (!hits.length) return [];

    if (hits.length === 1) {
      const hitRow = row(hits[0]);
      const hitColumn = column(hits[0]);
      return [[-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([rowOffset, columnOffset]) => {
        const nextRow = hitRow + rowOffset;
        const nextColumn = hitColumn + columnOffset;
        const next = nextRow * seaBattleSize + nextColumn;
        return inside(nextRow, nextColumn) && !shots[next] ? [next] : [];
      });
    }

    const horizontal = hits.every((cell) => row(cell) === row(hits[0]));
    const coordinates = hits.map(horizontal ? column : row);
    const minimum = Math.min(...coordinates);
    const maximum = Math.max(...coordinates);
    const fixed = horizontal ? row(hits[0]) : column(hits[0]);
    return Array.from({ length: maximum - minimum + 3 }, (_, index) => minimum - 1 + index).flatMap((coordinate) => {
      const nextRow = horizontal ? fixed : coordinate;
      const nextColumn = horizontal ? coordinate : fixed;
      if (!inside(nextRow, nextColumn)) return [];
      const next = nextRow * seaBattleSize + nextColumn;
      return shots[next] ? [] : [next];
    });
  });
  const candidates = [...new Set(woundedNeighbours.length ? woundedNeighbours : unshot)];
  return candidates[Math.floor(random() * candidates.length)];
}
