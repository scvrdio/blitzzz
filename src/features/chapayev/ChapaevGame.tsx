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
type Guide = { x: number; y: number; angle: number; length: number; thickness: number; power: number };
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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
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

  const syncRoom = (next: ChapaevRoom, currentUserId: string) => {
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
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
    setMovingState(false);
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`chapayev-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chapayev_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validRoom(next)) syncRoom(next, currentUserId);
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
    subscribe(id, user.id);
    syncRoom(data, user.id);
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

  const saveMultiplayerState = async (nextPieces: Piece[], nextRanks: Record<Side, number>, nextTurn: Side, nextWinner: Side | null) => {
    const activeRoom = roomRef.current;
    if (!activeRoom || !userId) return;
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
      return;
    }
    if (validRoom(data)) syncRoom(data, userId);
  };

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

      for (const piece of next) {
        if (piece.eliminatedAt && now - piece.eliminatedAt >= 2000) {
          changed = true;
          continue;
        }
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        const damping = Math.pow(.004, dt);
        piece.vx *= damping;
        piece.vy *= damping;
        if (Math.abs(piece.vx) < 5) piece.vx = 0;
        if (Math.abs(piece.vy) < 5) piece.vy = 0;
        const leftBoard = piece.x < 0 || piece.x > world.boardSize || piece.y < world.boardTop || piece.y > world.boardTop + world.boardSize;
        if (leftBoard && !piece.eliminatedAt) {
          piece.eliminatedAt = now;
          changed = true;
        }
      }
      next = next.filter((piece) => !piece.eliminatedAt || now - piece.eliminatedAt < 5000);

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
            const impulse = -relativeSpeed * .92;
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
              telegram.notify(roundWinner === playerSide ? 'success' : 'error');
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
  }, [mySide, playerSide, room, started, userId]);

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
    const scale = (power / distance) * 11;
    piece.vx = dx * scale;
    piece.vy = dy * scale;
    shotCountsRef.current = {
      blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
      black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
    };
    strikerIdRef.current = pieceId;
    setMovingState(true);
    playGameSound('/sounds/ship-miss.wav', .5);
    telegram.impact(power > 140 ? 'heavy' : 'medium');
  };

  const start = () => {
    if (roomRef.current) {
      void supabase.rpc('restart_chapayev_room', { room_id: roomRef.current.id }).then(({ data, error }) => {
        if (error) return notice.show('Не удалось начать новую игру');
        if (validRoom(data) && userId) syncRoom(data, userId);
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
      const candidates = piecesRef.current.filter((piece) => piece.side === botSide && !piece.eliminatedAt);
      const targets = piecesRef.current.filter((piece) => piece.side === playerSide && !piece.eliminatedAt);
      const piece = candidates[Math.floor(Math.random() * candidates.length)];
      const target = targets.sort((a, b) => Math.hypot(a.x - piece.x, a.y - piece.y) - Math.hypot(b.x - piece.x, b.y - piece.y))[0];
      if (!piece || !target) return;
      const dx = target.x - piece.x;
      const dy = target.y - piece.y;
      const distance = Math.hypot(dx, dy) || 1;
      piece.vx = dx / distance * (620 + Math.random() * 340);
      piece.vy = dy / distance * (620 + Math.random() * 340);
      shotCountsRef.current = {
        blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
        black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
      };
      strikerIdRef.current = piece.id;
      setMovingState(true);
      telegram.impact('medium');
    }, 850);
    return () => { if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current); };
  }, [botSide, moving, room, playerSide, started, turn, winner]);

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
      if (piece.side !== playerSide || piece.eliminatedAt) return false;
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

  const guide = useMemo(() => {
    if (!drag) return null;
    const piece = pieces.find((candidate) => candidate.id === drag.pieceId);
    if (!piece) return null;
    const startPoint = displayPointFor(geometry, flipped, piece.x, piece.y);
    const pointer = rotatePoint(geometry, (4 - rotationTurns) % 4, drag.x, drag.y);
    const dx = pointer.x - startPoint.x;
    const dy = pointer.y - startPoint.y;
    const length = Math.min(Math.hypot(dx, dy), 150);
    return { x: startPoint.x, y: startPoint.y, angle: Math.atan2(dy, dx) * 180 / Math.PI, length, thickness: Math.min(34, Math.max(8, length * .22)), power: length / 150 };
  }, [drag, flipped, geometry, pieces, rotationTurns]);

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
        subscribe(data.id, user.id);
        syncRoom(data, user.id);
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
          <div ref={boardAreaRef} className="chapaev-rotating-layer" style={{ transform: `rotate(${boardRotation * 90}deg) scale(${isRotating ? .75 : 1})`, transformOrigin: `${geometry.boardSize / 2}px ${geometry.boardTop + geometry.boardSize / 2}px` }}>
            <div className="chapaev-board" style={{ top: geometry.boardTop, width: geometry.boardSize, height: geometry.boardSize }} />
            {guide ? <span className="chapaev-guide" style={{ left: guide.x, top: guide.y - guide.thickness / 2, width: guide.length, height: guide.thickness, opacity: .42 + guide.power * .5, '--guide-angle': `${guide.angle}deg` } as React.CSSProperties} /> : null}
            {releaseGuide ? <span className="chapaev-guide chapaev-guide--release" style={{ left: releaseGuide.x, top: releaseGuide.y - releaseGuide.thickness / 2, width: releaseGuide.length, height: releaseGuide.thickness, '--guide-angle': `${releaseGuide.angle}deg` } as React.CSSProperties} /> : null}
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
