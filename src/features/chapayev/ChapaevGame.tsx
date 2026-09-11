'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { Button } from '../../components/ui/Button';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';
import { useNotice } from '../../hooks/use-notice';

type Side = 'blue' | 'black';
type Piece = { id: string; side: Side; x: number; y: number; vx: number; vy: number; eliminatedAt?: number };
type Geometry = { width: number; height: number; boardTop: number; boardSize: number; radius: number };
type Drag = { pieceId: string; x: number; y: number };
type Guide = { x: number; y: number; angle: number; length: number; thickness: number; power: number; side: Side };
type ChapaevRoom = {
  id: string;
  blue_player: string;
  black_player: string | null;
  blue_name: string | null;
  black_name: string | null;
  blue_avatar: string | null;
  black_avatar: string | null;
  pieces: Piece[];
  ranks: Record<Side, number>;
  turn: Side;
  status: 'waiting' | 'active' | 'finished';
  winner: Side | null;
  updated_at?: string;
};

const sides: Side[] = ['blue', 'black'];
const opponentOf = (side: Side): Side => side === 'blue' ? 'black' : 'blue';
const emptyGeometry: Geometry = { width: 0, height: 0, boardTop: 0, boardSize: 0, radius: 0 };
const surfaceVelocityRetention = .0015;
const collisionTransfer = .58;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const applySurfaceFriction = (piece: Piece, dt: number) => {
  const factor = Math.pow(surfaceVelocityRetention, dt);
  piece.vx *= factor;
  piece.vy *= factor;
};
const playerShotSpeed = (pull: number) => {
  const precisionRange = Math.min(pull, 165);
  const powerRange = Math.max(0, pull - 165);
  return precisionRange * 11 + powerRange * 22;
};
const addReleaseImperfection = (vx: number, vy: number, pull: number) => {
  const intensity = clamp((pull - 90) / 130, 0, 1);
  const angle = randomBetween(-1, 1) * (Math.PI / 180) * (0.5 + intensity * 4);
  const force = 1 + randomBetween(-.05, .05) * intensity;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    vx: (vx * cos - vy * sin) * force,
    vy: (vx * sin + vy * cos) * force,
  };
};
const displayPointFor = (geometry: Geometry, flipped: boolean, x: number, y: number) =>
  flipped ? { x: geometry.boardSize - x, y: geometry.boardTop + geometry.boardSize - (y - geometry.boardTop) } : { x, y };
const rotatePoint = (geometry: Geometry, turns: number, x: number, y: number) => {
  const centerX = geometry.boardSize / 2;
  const centerY = geometry.boardTop + geometry.boardSize / 2;
  let nextX = x - centerX;
  let nextY = y - centerY;
  for (let index = 0; index < turns; index += 1) [nextX, nextY] = [-nextY, nextX];
  return { x: centerX + nextX, y: centerY + nextY };
};

function setUpPieces(geometry: Geometry, ranks: Record<Side, number>) {
  if (!geometry.boardSize) return [];
  const cell = geometry.boardSize / 8;
  return sides.flatMap((side) => Array.from({ length: 8 }, (_, index): Piece => ({
    id: `${side}-${index}`,
    side,
    x: cell * (index + .5),
    y: geometry.boardTop + cell * (ranks[side] + .5),
    vx: 0,
    vy: 0,
  })));
}

function validRoom(value: unknown): value is ChapaevRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<ChapaevRoom>;
  return typeof room.id === 'string' && Array.isArray(room.pieces) && typeof room.ranks === 'object'
    && (room.turn === 'blue' || room.turn === 'black');
}

type BotShot = { piece: Piece; vx: number; vy: number; score: number };

function simulateBotShot(source: readonly Piece[], geometry: Geometry, botSide: Side, pieceId: string, vx: number, vy: number) {
  const pieces: Piece[] = source.filter((piece) => !piece.eliminatedAt).map((piece) => ({ ...piece, eliminatedAt: undefined }));
  const striker = pieces.find((piece) => piece.id === pieceId);
  if (!striker) return Number.NEGATIVE_INFINITY;
  striker.vx = vx;
  striker.vy = vy;
  const startingEnemy = pieces.filter((piece) => piece.side !== botSide);
  const startingOwn = pieces.filter((piece) => piece.side === botSide).length;
  let enemyContacts = 0;
  const stepDt = 1 / 120;

  for (let step = 0; step < 180; step += 1) {
    for (const piece of pieces) {
      if (piece.eliminatedAt) continue;
      piece.x += piece.vx * stepDt;
      piece.y += piece.vy * stepDt;
      applySurfaceFriction(piece, stepDt);
    }

    for (let firstIndex = 0; firstIndex < pieces.length; firstIndex += 1) {
      const first = pieces[firstIndex];
      if (first.eliminatedAt) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < pieces.length; secondIndex += 1) {
        const second = pieces[secondIndex];
        if (second.eliminatedAt) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy) || .001;
        const minDistance = geometry.radius * 2;
        if (distance >= minDistance) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        first.x -= nx * overlap / 2;
        first.y -= ny * overlap / 2;
        second.x += nx * overlap / 2;
        second.y += ny * overlap / 2;
        const relativeSpeed = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
        if (relativeSpeed < 0) {
          const impulse = -relativeSpeed * collisionTransfer;
          first.vx -= impulse * nx;
          first.vy -= impulse * ny;
          second.vx += impulse * nx;
          second.vy += impulse * ny;
          if (first.side !== second.side) enemyContacts += 1;
        }
      }
    }

    for (const piece of pieces) {
      if (piece.eliminatedAt) continue;
      if (piece.x < 0 || piece.x > geometry.boardSize || piece.y < geometry.boardTop || piece.y > geometry.boardTop + geometry.boardSize) piece.eliminatedAt = 1;
    }
    if (pieces.every((piece) => piece.eliminatedAt || Math.hypot(piece.vx, piece.vy) < 8)) break;
  }

  const enemyRemaining = pieces.filter((piece) => piece.side !== botSide && !piece.eliminatedAt);
  const ownRemaining = pieces.filter((piece) => piece.side === botSide && !piece.eliminatedAt).length;
  const enemyRemoved = startingEnemy.length - enemyRemaining.length;
  const ownRemoved = startingOwn - ownRemaining;
  const strikerStayed = pieces.some((piece) => piece.id === pieceId && !piece.eliminatedAt);
  const edgeProgress = startingEnemy.reduce((progress, before) => {
    const after = enemyRemaining.find((piece) => piece.id === before.id);
    if (!after) return progress;
    const beforeEdge = Math.min(before.x, geometry.boardSize - before.x, before.y - geometry.boardTop, geometry.boardTop + geometry.boardSize - before.y);
    const afterEdge = Math.min(after.x, geometry.boardSize - after.x, after.y - geometry.boardTop, geometry.boardTop + geometry.boardSize - after.y);
    return progress + beforeEdge - afterEdge;
  }, 0);
  return enemyRemoved * 2200 - ownRemoved * 850 + (strikerStayed ? 260 : 0) + enemyContacts * 90 + edgeProgress * 2;
}

function chooseBotShot(source: readonly Piece[], geometry: Geometry, botSide: Side): BotShot | null {
  const own = source.filter((piece) => piece.side === botSide && !piece.eliminatedAt);
  const enemies = source.filter((piece) => piece.side !== botSide && !piece.eliminatedAt);
  if (!own.length || !enemies.length || !geometry.boardSize) return null;
  const pairs = own.flatMap((piece) => enemies.map((target) => ({ piece, target, distance: Math.hypot(target.x - piece.x, target.y - piece.y) })))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 16);
  const candidates: BotShot[] = [];

  for (const { piece, target, distance } of pairs) {
    const baseX = (target.x - piece.x) / (distance || 1);
    const baseY = (target.y - piece.y) / (distance || 1);
    const baseSpeed = clamp(distance * 5.8 + 450, 1500, 2350);
    for (const offset of [-.32, 0, .32]) {
      const aimX = target.x + -baseY * geometry.radius * offset;
      const aimY = target.y + baseX * geometry.radius * offset;
      const aimDistance = Math.hypot(aimX - piece.x, aimY - piece.y) || 1;
      for (const speedFactor of [.9, 1, 1.08]) {
        const speed = Math.min(2500, baseSpeed * speedFactor);
        const vx = (aimX - piece.x) / aimDistance * speed;
        const vy = (aimY - piece.y) / aimDistance * speed;
        const score = simulateBotShot(source, geometry, botSide, piece.id, vx, vy);
        candidates.push({ piece, vx, vy, score });
      }
    }
  }

  candidates.sort((first, second) => second.score - first.score);
  if (!candidates.length) return null;

  const top = candidates.slice(0, 10);
  const imperfect = candidates.slice(10, 36);
  let selected: BotShot;
  if (imperfect.length && Math.random() < .35) {
    selected = imperfect[Math.floor(Math.random() * imperfect.length)];
  } else {
    const weights = [5, 4, 3, 3, 2, 2, 2, 1, 1, 1].slice(0, top.length);
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    selected = top[0];
    for (let index = 0; index < top.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) {
        selected = top[index];
        break;
      }
    }
  }

  const speed = Math.hypot(selected.vx, selected.vy);
  const distanceRatio = clamp(speed / 2500, 0, 1);
  const angleError = randomBetween(-8.5, 8.5) * (Math.PI / 180) * (.7 + distanceRatio * .3);
  const forceError = randomBetween(.84, 1.1);
  const cos = Math.cos(angleError);
  const sin = Math.sin(angleError);
  return {
    ...selected,
    vx: (selected.vx * cos - selected.vy * sin) * forceError,
    vy: (selected.vx * sin + selected.vy * cos) * forceError,
  };
}

export function ChapaevGame({ initialRoomId, playerSide = 'blue' }: { initialRoomId?: string; playerSide?: Side }) {
  const [started, setStarted] = useState(true);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [geometry, setGeometry] = useState<Geometry>(emptyGeometry);
  const [turn, setTurn] = useState<Side>('blue');
  const [moving, setMoving] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [boardRotation, setBoardRotation] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [impactTick, setImpactTick] = useState(0);
  const [releaseGuide, setReleaseGuide] = useState<Guide | null>(null);
  const [room, setRoom] = useState<ChapaevRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const geometryRef = useRef<Geometry>(emptyGeometry);
  const ranksRef = useRef<Record<Side, number>>({ blue: 7, black: 0 });
  const turnRef = useRef<Side>('blue');
  const dragRef = useRef<Drag | null>(null);
  const movingRef = useRef(false);
  const winnerRef = useRef<Side | null>(null);
  const shotCountsRef = useRef<Record<Side, number> | null>(null);
  const strikerIdRef = useRef<string | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const roundTimerRef = useRef<number | null>(null);
  const rotationTimerRef = useRef<number | null>(null);
  const guideTimerRef = useRef<number | null>(null);
  const roomRef = useRef<ChapaevRoom | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const notice = useNotice();
  const mySide: Side = room?.blue_player === userId ? 'blue' : room?.black_player === userId ? 'black' : playerSide;
  const botSide = opponentOf(mySide);
  const flipped = mySide === 'black';
  const rotationTurns = ((boardRotation % 4) + 4) % 4;

  useEffect(() => { preloadGameSounds(['/sounds/ship-miss.wav']); }, []);

  const setPieceState = (next: Piece[]) => {
    piecesRef.current = next;
    setPieces(next.map((piece) => ({ ...piece })));
  };

  const setTurnState = (next: Side) => {
    turnRef.current = next;
    setTurn(next);
  };

  const setMovingState = (next: boolean) => {
    movingRef.current = next;
    setMoving(next);
  };

  const resetRound = (nextRanks = ranksRef.current, nextTurn: Side = 'blue') => {
    ranksRef.current = nextRanks;
    setPieceState(setUpPieces(geometryRef.current, nextRanks));
    setTurnState(nextTurn);
    setMovingState(false);
    shotCountsRef.current = null;
  };

  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return mySide === 'blue'
      ? { name: room.black_name || 'Игрок', avatar: room.black_avatar || undefined, multiplayer: true }
      : { name: room.blue_name || 'Игрок', avatar: room.blue_avatar || undefined, multiplayer: true };
  }, [mySide, room]);

  const syncRoom = (next: ChapaevRoom) => {
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) <= Date.parse(previous.updated_at)) return;
    const incomingMoving = next.pieces.some((piece) => Math.hypot(piece.vx, piece.vy) > .01);
    // Realtime echoes the launch back to the shooter. Its local simulation is already
    // running, so applying that snapshot would rewind the first frames of the hit.
    if (incomingMoving && movingRef.current) return;
    roomRef.current = next;
    setRoom(next);
    ranksRef.current = next.ranks;
    const world = geometryRef.current;
    const size = world.boardSize || 1;
    setPieceState(next.pieces.map((piece) => ({
      ...piece,
      x: piece.x * size,
      y: world.boardTop + piece.y * size,
      vx: piece.vx * size,
      vy: piece.vy * size,
    })));
    setTurnState(next.turn);
    winnerRef.current = next.winner;
    setWinner(next.winner);
    setStarted(next.status !== 'waiting');
    if (incomingMoving) {
      shotCountsRef.current = {
        blue: next.pieces.filter((piece) => piece.side === 'blue' && !piece.eliminatedAt).length,
        black: next.pieces.filter((piece) => piece.side === 'black' && !piece.eliminatedAt).length,
      };
      strikerIdRef.current = next.pieces.reduce<Piece | null>((fastest, piece) => (
        !fastest || Math.hypot(piece.vx, piece.vy) > Math.hypot(fastest.vx, fastest.vy) ? piece : fastest
      ), null)?.id ?? null;
      setMovingState(true);
      playGameSound('/sounds/ship-miss.wav', .5);
    } else {
      shotCountsRef.current = null;
      strikerIdRef.current = null;
      setMovingState(false);
    }
  };

  const subscribe = (id: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`chapayev-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chapayev_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validRoom(next)) syncRoom(next);
      })
      .subscribe();
  };

  const connectRoom = async (id: string) => {
    const user: User = await ensureAnonymousUser();
    setUserId(user.id);
    const profile = telegramProfile();
    const { data, error } = await supabase.rpc('join_chapayev_room', {
      room_id: id,
      player_name: profile?.name ?? 'Игрок',
      player_avatar: profile?.photoUrl ?? null,
    });
    if (error) throw error;
    if (!validRoom(data)) throw new Error('Сервер вернул некорректное состояние игры');
    subscribe(id);
    syncRoom(data);
  };

  const connectToInitialRoom = useEffectEvent((id: string) => {
    void connectRoom(id).catch((error) => notice.show(errorMessage(error, 'Не удалось открыть игру')));
  });

  useEffect(() => {
    if (initialRoomId) {
      const timer = window.setTimeout(() => connectToInitialRoom(initialRoomId), 0);
      return () => { window.clearTimeout(timer); void channelRef.current?.unsubscribe(); };
    }
    return () => { void channelRef.current?.unsubscribe(); };
  }, [initialRoomId]);

  const persistMultiplayerState = async (nextPieces: Piece[], nextRanks: Record<Side, number>, nextTurn: Side, nextWinner: Side | null) => {
    const activeRoom = roomRef.current;
    if (!activeRoom || !userId) return null;
    const world = geometryRef.current;
    const size = world.boardSize || 1;
    const normalizedPieces = nextPieces.map((piece) => ({
      ...piece,
      x: piece.x / size,
      y: (piece.y - world.boardTop) / size,
      vx: piece.vx / size,
      vy: piece.vy / size,
    }));
    const { data, error } = await supabase.rpc('make_chapayev_move', {
      room_id: activeRoom.id,
      next_pieces: normalizedPieces,
      next_ranks: nextRanks,
      next_turn: nextTurn,
      next_winner: nextWinner,
    });
    if (error) {
      notice.show('Ход не прошёл');
      return null;
    }
    return validRoom(data) ? data : null;
  };

  const saveMultiplayerState = useEffectEvent(async (nextPieces: Piece[], nextRanks: Record<Side, number>, nextTurn: Side, nextWinner: Side | null) => {
    const data = await persistMultiplayerState(nextPieces, nextRanks, nextTurn, nextWinner);
    if (data) syncRoom(data);
  });

  useEffect(() => {
    const boardArea = boardAreaRef.current;
    if (!boardArea) return;
    const updateGeometry = () => {
      const rect = boardArea.getBoundingClientRect();
      const boardTop = 0;
      const boardSize = Math.min(rect.width, rect.height);
      const next = { width: rect.width, height: rect.height, boardTop, boardSize, radius: boardSize / 20 };
      geometryRef.current = next;
      setGeometry(next);
      if (!piecesRef.current.length) setPieceState(setUpPieces(next, ranksRef.current));
    };
    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(boardArea);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tick = (time: number) => {
      const previousTime = lastFrameRef.current || time;
      const dt = Math.min((time - previousTime) / 1000, .032);
      lastFrameRef.current = time;
      const world = geometryRef.current;
      let next = piecesRef.current.map((piece) => ({ ...piece }));
      let changed = false;
      const now = Date.now();
      const maxSpeed = next.reduce((speed, piece) => Math.max(speed, Math.hypot(piece.vx, piece.vy)), 0);
      const maxTravelPerStep = Math.max(world.radius * .35, 2);
      const substeps = Math.min(24, Math.max(1, Math.ceil(maxSpeed * dt / maxTravelPerStep)));
      const stepDt = dt / substeps;

      for (let step = 0; step < substeps; step += 1) {
        for (const piece of next) {
          piece.x += piece.vx * stepDt;
          piece.y += piece.vy * stepDt;
          applySurfaceFriction(piece, stepDt);
          if (Math.abs(piece.vx) < 5) piece.vx = 0;
          if (Math.abs(piece.vy) < 5) piece.vy = 0;
        }

        for (let i = 0; i < next.length; i += 1) {
          const first = next[i];
          if (first.eliminatedAt) continue;
          for (let j = i + 1; j < next.length; j += 1) {
            const second = next[j];
            if (second.eliminatedAt) continue;
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distance = Math.hypot(dx, dy) || .001;
            const minDistance = world.radius * 2;
            if (distance >= minDistance) continue;
            const nx = dx / distance;
            const ny = dy / distance;
            const overlap = minDistance - distance;
            first.x -= nx * overlap / 2;
            first.y -= ny * overlap / 2;
            second.x += nx * overlap / 2;
            second.y += ny * overlap / 2;
            const relativeSpeed = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
            if (relativeSpeed < 0) {
              const impulse = -relativeSpeed * collisionTransfer;
              first.vx -= impulse * nx;
              first.vy -= impulse * ny;
              second.vx += impulse * nx;
              second.vy += impulse * ny;
              telegram.impact(Math.abs(relativeSpeed) > 480 ? 'heavy' : Math.abs(relativeSpeed) > 180 ? 'medium' : 'light');
              playGameSound('/sounds/ship-miss.wav', .5);
              if (Math.abs(relativeSpeed) > 480) setImpactTick((tick) => tick + 1);
            }
            changed = true;
          }
        }

        for (const piece of next) {
          const leftBoard = piece.x < 0 || piece.x > world.boardSize || piece.y < world.boardTop || piece.y > world.boardTop + world.boardSize;
          if (leftBoard && !piece.eliminatedAt) {
            piece.eliminatedAt = now;
            changed = true;
          }
        }
      }

      next = next.filter((piece) => !piece.eliminatedAt || now - piece.eliminatedAt < 5000);

      const anyInMotion = next.some((piece) => Math.hypot(piece.vx, piece.vy) > 10);
      if (started && movingRef.current && !anyInMotion) {
        const before = shotCountsRef.current;
        const active = (side: Side) => next.filter((piece) => piece.side === side && !piece.eliminatedAt).length;
        const current = turnRef.current;
        const enemy = opponentOf(current);
        const enemyRemoved = Boolean(before && active(enemy) < before[enemy]);
        const strikerStayedOnBoard = Boolean(strikerIdRef.current && next.some((piece) => piece.id === strikerIdRef.current && !piece.eliminatedAt));
        setMovingState(false);
        shotCountsRef.current = null;
        strikerIdRef.current = null;
        if (active(enemy) === 0 || active(current) === 0) {
          if (active(enemy) === 0 && active(current) === 0) {
            telegram.notify('warning');
            roundTimerRef.current = window.setTimeout(() => {
              setPieceState(setUpPieces(geometryRef.current, ranksRef.current));
              setTurnState('blue');
              setMovingState(false);
            }, 750);
          } else {
            const roundWinner = active(enemy) === 0 ? current : enemy;
            const roundLoser = opponentOf(roundWinner);
            const nextRanks = { ...ranksRef.current };
            const rowsAreAdjacent = Math.abs(nextRanks.blue - nextRanks.black) === 1;
            if (rowsAreAdjacent) nextRanks[roundLoser] += roundLoser === 'blue' ? 1 : -1;
            else nextRanks[roundWinner] += roundWinner === 'blue' ? -1 : 1;
            const reachedFinish = rowsAreAdjacent && (nextRanks[roundLoser] < 0 || nextRanks[roundLoser] > 7);
            if (reachedFinish) {
              winnerRef.current = roundWinner;
              setWinner(roundWinner);
              setTurnState(roundWinner);
              telegram.notify(roundWinner === mySide ? 'success' : 'error');
            } else {
              telegram.notify('success');
              roundTimerRef.current = window.setTimeout(() => {
                ranksRef.current = nextRanks;
                setPieceState(setUpPieces(geometryRef.current, nextRanks));
                setTurnState(roundWinner);
                setMovingState(false);
              }, 750);
            }
          }
        } else {
          setTurnState(enemyRemoved && strikerStayedOnBoard ? current : enemy);
        }
        if (roomRef.current && current === mySide) {
          window.setTimeout(() => {
            void saveMultiplayerState(piecesRef.current, ranksRef.current, turnRef.current, winnerRef.current);
          }, 800);
        }
        changed = true;
      }

      if (changed || movingRef.current) setPieceState(next);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current); };
  }, [mySide, room, started, userId]);

  const displayPoint = (x: number, y: number) => {
    const world = geometryRef.current;
    const base = displayPointFor(world, flipped, x, y);
    return rotatePoint(world, rotationTurns, base.x, base.y);
  };

  const worldPoint = (x: number, y: number) => {
    const world = geometryRef.current;
    const base = rotatePoint(world, (4 - rotationTurns) % 4, x, y);
    return flipped ? { x: world.boardSize - base.x, y: world.boardTop + world.boardSize - (base.y - world.boardTop) } : base;
  };

  const inputPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = boardAreaRef.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
  };

  const launch = (pieceId: string, pointer: { x: number; y: number }) => {
    if (movingRef.current || winnerRef.current) return;
    const worldPointer = worldPoint(pointer.x, pointer.y);
    const piece = piecesRef.current.find((candidate) => candidate.id === pieceId && !candidate.eliminatedAt);
    if (!piece) return;
    const dx = piece.x - worldPointer.x;
    const dy = piece.y - worldPointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 18) return;
    const power = clamp(distance, 0, 220);
    const scale = playerShotSpeed(power) / distance;
    const velocity = addReleaseImperfection(dx * scale, dy * scale, power);
    piece.vx = velocity.vx;
    piece.vy = velocity.vy;
    shotCountsRef.current = {
      blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
      black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
    };
    strikerIdRef.current = pieceId;
    setMovingState(true);
    playGameSound('/sounds/ship-miss.wav', .5);
    telegram.impact(power > 140 ? 'heavy' : 'medium');
    if (roomRef.current) {
      void persistMultiplayerState(piecesRef.current, ranksRef.current, turnRef.current, winnerRef.current).then((data) => {
        const activeRoom = roomRef.current;
        if (!data?.updated_at || !activeRoom) return;
        if (!activeRoom.updated_at || Date.parse(data.updated_at) > Date.parse(activeRoom.updated_at)) {
          roomRef.current = { ...activeRoom, updated_at: data.updated_at };
        }
      });
    }
  };

  const start = () => {
    if (roomRef.current) {
      void supabase.rpc('restart_chapayev_room', { room_id: roomRef.current.id }).then(({ data, error }) => {
        if (error) return notice.show('Не удалось начать новую игру');
        if (validRoom(data) && userId) syncRoom(data);
      });
      return;
    }
    winnerRef.current = null;
    setWinner(null);
    ranksRef.current = { blue: 7, black: 0 };
    resetRound(ranksRef.current, 'blue');
    setStarted(true);
    telegram.impact('medium');
  };

  useEffect(() => {
    if (room || !started || moving || winner || turn !== botSide) return;
    botTimerRef.current = window.setTimeout(() => {
      const shot = chooseBotShot(piecesRef.current, geometryRef.current, botSide);
      if (!shot) return;
      const piece = piecesRef.current.find((candidate) => candidate.id === shot.piece.id);
      if (!piece) return;
      piece.vx = shot.vx;
      piece.vy = shot.vy;
      shotCountsRef.current = {
        blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
        black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
      };
      strikerIdRef.current = piece.id;
      setMovingState(true);
      telegram.impact('medium');
    }, 850);
    return () => { if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current); };
  }, [botSide, moving, room, started, turn, winner]);

  useEffect(() => () => {
    if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    if (roundTimerRef.current !== null) window.clearTimeout(roundTimerRef.current);
    if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
  }, []);

  useEffect(() => {
    telegram.setVerticalSwipes(true);
    return () => telegram.setVerticalSwipes(false);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!started || moving || winner || room?.status === 'waiting' || turn !== mySide) return;
    const point = inputPoint(event);
    if (!point) return;
    const candidate = piecesRef.current.find((piece) => {
      if (piece.side !== mySide || piece.eliminatedAt) return false;
      const display = displayPoint(piece.x, piece.y);
      return Math.hypot(display.x - point.x, display.y - point.y) <= geometryRef.current.radius * 1.2;
    });
    if (!candidate) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { pieceId: candidate.id, ...point };
    dragRef.current = next;
    setDrag(next);
    telegram.selectionChanged();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    const point = inputPoint(event);
    if (!point) return;
    const next = { pieceId: dragRef.current.pieceId, ...point };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) event.preventDefault();
    const activeDrag = dragRef.current;
    const point = inputPoint(event);
    if (activeDrag && point) {
      if (guide) {
        if (guideTimerRef.current !== null) window.clearTimeout(guideTimerRef.current);
        setReleaseGuide(guide);
        guideTimerRef.current = window.setTimeout(() => setReleaseGuide(null), 180);
      }
      launch(activeDrag.pieceId, point);
    }
    dragRef.current = null;
    setDrag(null);
  };

  const guide = (() => {
    if (!drag) return null;
    const piece = pieces.find((candidate) => candidate.id === drag.pieceId);
    if (!piece) return null;
    const startPoint = displayPointFor(geometry, flipped, piece.x, piece.y);
    const pointer = rotatePoint(geometry, (4 - rotationTurns) % 4, drag.x, drag.y);
    const dx = pointer.x - startPoint.x;
    const dy = pointer.y - startPoint.y;
    const length = Math.min(Math.hypot(dx, dy), 150);
    return { x: startPoint.x, y: startPoint.y, angle: Math.atan2(dy, dx) * 180 / Math.PI, length, thickness: Math.min(34, Math.max(8, length * .22)), power: length / 150, side: piece.side };
  })();

  const status = winner ? (winner === mySide ? 'Победа' : 'Поражение') : room?.status === 'waiting' ? '' : !started ? (mySide === 'blue' ? 'Твой ход' : 'Ход соперника') : turn === mySide ? 'Твой ход' : 'Ход соперника';
  const statusMuted = winner ? winner === 'black' : !started ? mySide === 'black' : turn === 'black';

  const invite = async () => {
    try {
      telegram.impact('light');
      let activeRoom = roomRef.current;
      if (!activeRoom) {
        const user: User = await ensureAnonymousUser();
        setUserId(user.id);
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_chapayev_room', {
          player_name: profile?.name ?? 'Игрок',
          player_avatar: profile?.photoUrl ?? null,
        });
        if (error) throw error;
        if (!validRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        window.history.replaceState(null, '', `/games/chapayev?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id);
        syncRoom(data);
      }
      const outcome = await shareGameInvite({ title: 'Чапаева', text: 'Сыграем в Чапаева?', startParam: `chapayev_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось поделиться игрой'));
    }
  };

  return (
    <GameShell
      title="Чапаева"
      opponent={opponent}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={statusMuted}
      game={
        <div
          ref={arenaRef}
          className={`chapaev-arena${impactTick ? ` chapaev-arena--impact-${impactTick % 2}` : ''}`}
          aria-label="Поле игры Чапаева"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div ref={boardAreaRef} className="chapaev-rotating-layer" style={{ transform: `rotate(${boardRotation * 90}deg) scale(${isRotating ? .85 : 1})`, transformOrigin: `${geometry.boardSize / 2}px ${geometry.boardTop + geometry.boardSize / 2}px` }}>
            <div className="chapaev-board" style={{ top: geometry.boardTop, width: geometry.boardSize, height: geometry.boardSize }} />
            {guide ? <span className={`chapaev-guide chapaev-guide--${guide.side}`} style={{ left: guide.x, top: guide.y - guide.thickness / 2, width: guide.length, height: guide.thickness, opacity: .42 + guide.power * .5, '--guide-angle': `${guide.angle}deg` } as React.CSSProperties} /> : null}
            {releaseGuide ? <span className={`chapaev-guide chapaev-guide--${releaseGuide.side} chapaev-guide--release`} style={{ left: releaseGuide.x, top: releaseGuide.y - releaseGuide.thickness / 2, width: releaseGuide.length, height: releaseGuide.thickness, '--guide-angle': `${releaseGuide.angle}deg` } as React.CSSProperties} /> : null}
            {pieces.map((piece) => {
              const point = displayPointFor(geometry, flipped, piece.x, piece.y);
              return <span key={piece.id} className={`chapaev-piece chapaev-piece--${piece.side}${piece.id === drag?.pieceId ? ' is-aiming' : ''}${piece.eliminatedAt ? ' is-eliminated' : ''}`} style={{ left: point.x, top: point.y, width: geometry.radius * 2, height: geometry.radius * 2 }} aria-hidden="true" />;
            })}
          </div>
        </div>
      }
      footer={winner
        ? <GameFooter variant="button" onPlayAgain={start} />
        : <GameFooter variant="custom" className="chapaev-footer">
              <Button
                className="chapaev-footer__rotate"
                variant="surface"
                disabled={moving}
                onClick={() => {
                  if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
                  setBoardRotation((current) => current + 1);
                  setIsRotating(true);
                  rotationTimerRef.current = window.setTimeout(() => setIsRotating(false), 180);
                  telegram.impact('light');
                }}
              >
                <Image src="/icons/rotate-board-icon.svg" width={20} height={20} alt="" unoptimized />
                <span>Повернуть поле</span>
              </Button>
            </GameFooter>}
    />
  );
}
