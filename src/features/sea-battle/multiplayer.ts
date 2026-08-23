import { emptyShots, type Ship, type ShipSize, type Shot, type ShotBoard } from './engine';

export type SeaBattleSide = 'host' | 'guest';
export type SeaBattleRoomStatus = 'waiting' | 'placing' | 'active' | 'finished';

export type SeaBattleRoom = {
  id: string;
  host_player: string;
  guest_player: string | null;
  host_name: string | null;
  guest_name: string | null;
  host_avatar: string | null;
  guest_avatar: string | null;
  status: SeaBattleRoomStatus;
  host_ready: boolean;
  guest_ready: boolean;
  turn: SeaBattleSide;
  winner: SeaBattleSide | null;
  host_shots: ShotBoard;
  guest_shots: ShotBoard;
  host_sunk: Ship[];
  guest_sunk: Ship[];
  updated_at?: string;
};

function validShot(value: unknown): value is Shot {
  return value === null || value === 'miss' || value === 'hit';
}

function validShip(value: unknown): value is Ship {
  if (!value || typeof value !== 'object') return false;
  const ship = value as Partial<Ship>;
  return typeof ship.id === 'string'
    && Number.isInteger(ship.size)
    && ship.size !== undefined
    && ship.size >= 1
    && ship.size <= 4
    && Array.isArray(ship.cells)
    && ship.cells.length === ship.size
    && ship.cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 100);
}

export function validSeaBattleRoom(value: unknown): value is SeaBattleRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<SeaBattleRoom>;
  return typeof room.id === 'string'
    && typeof room.host_player === 'string'
    && (room.guest_player === null || typeof room.guest_player === 'string')
    && ['waiting', 'placing', 'active', 'finished'].includes(room.status ?? '')
    && (room.turn === 'host' || room.turn === 'guest')
    && (room.winner === null || room.winner === 'host' || room.winner === 'guest')
    && typeof room.host_ready === 'boolean'
    && typeof room.guest_ready === 'boolean'
    && Array.isArray(room.host_shots)
    && room.host_shots.length === 100
    && room.host_shots.every(validShot)
    && Array.isArray(room.guest_shots)
    && room.guest_shots.length === 100
    && room.guest_shots.every(validShot)
    && Array.isArray(room.host_sunk)
    && room.host_sunk.every(validShip)
    && Array.isArray(room.guest_sunk)
    && room.guest_sunk.every(validShip);
}

export function validFleet(value: unknown): value is Ship[] {
  return Array.isArray(value) && value.every(validShip);
}

export function sideForUser(room: SeaBattleRoom, userId: string | null): SeaBattleSide | null {
  if (room.host_player === userId) return 'host';
  if (room.guest_player === userId) return 'guest';
  return null;
}

export function opponentSide(side: SeaBattleSide): SeaBattleSide {
  return side === 'host' ? 'guest' : 'host';
}

export function shotsFor(room: SeaBattleRoom, side: SeaBattleSide): ShotBoard {
  return side === 'host' ? room.host_shots : room.guest_shots;
}

export function sunkFor(room: SeaBattleRoom, side: SeaBattleSide): Ship[] {
  return side === 'host' ? room.host_sunk : room.guest_sunk;
}

export function readyFor(room: SeaBattleRoom, side: SeaBattleSide): boolean {
  return side === 'host' ? room.host_ready : room.guest_ready;
}

export function hiddenFleetWithSunkShips(ships: readonly Ship[]): Ship[] {
  return ships.map((ship) => ({ ...ship, size: ship.size as ShipSize, cells: [...ship.cells] }));
}

export function safeShots(value: unknown): ShotBoard {
  return Array.isArray(value) && value.length === 100 && value.every(validShot) ? [...value] : emptyShots();
}
