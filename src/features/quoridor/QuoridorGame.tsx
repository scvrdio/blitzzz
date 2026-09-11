'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { canPlaceWall, distanceToGoal, initialState, legalMoves, type GameState, type Position, type Side, type Wall } from './engine';

type Drag = { row: number; col: number; x: number; y: number };
type PlayerMode = 'move' | 'wall';
type WallDrag = { orientation: Wall['orientation']; wall: Wall | null };
type WallCounts = Record<Side, number>;
type QuoridorRoom = {
  id: string;
  blue_player: string;
  black_player: string | null;
  blue_name: string | null;
  black_name: string | null;
  blue_avatar: string | null;
  black_avatar: string | null;
  state: GameState;
  blue_walls: number;
  black_walls: number;
  turn: Side;
  status: 'waiting' | 'active' | 'finished';
  winner: Side | null;
  updated_at?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const equal = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
const opponentOf = (side: Side): Side => side === 'blue' ? 'black' : 'blue';

function validPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const position = value as Partial<Position>;
  return Number.isInteger(position.row) && Number.isInteger(position.col);
}

function validWall(value: unknown): value is Wall {
  if (!value || typeof value !== 'object') return false;
  const wall = value as Partial<Wall>;
  return Number.isInteger(wall.row) && Number.isInteger(wall.col) && (wall.orientation === 'horizontal' || wall.orientation === 'vertical');
}

function validRoom(value: unknown): value is QuoridorRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<QuoridorRoom>;
  return typeof room.id === 'string'
    && Boolean(room.state)
    && validPosition(room.state?.blue)
    && validPosition(room.state?.black)
    && Array.isArray(room.state?.walls)
    && room.state.walls.every(validWall)
    && Number.isInteger(room.blue_walls)
    && Number.isInteger(room.black_walls)
    && (room.turn === 'blue' || room.turn === 'black')
    && (room.status === 'waiting' || room.status === 'active' || room.status === 'finished');
}

export function QuoridorGame({ initialRoomId }: { initialRoomId?: string }) {
  const [state, setState] = useState<GameState>(initialState);
  const [turn, setTurn] = useState<Side>('blue');
  const [walls, setWalls] = useState<WallCounts>({ blue: 10, black: 10 });
  const [thinking, setThinking] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [mode, setMode] = useState<PlayerMode>('move');
  const [preview, setPreview] = useState<Wall | null>(null);
  const [room, setRoom] = useState<QuoridorRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const wallDragRef = useRef<WallDrag | null>(null);
  const botTurnRef = useRef(0);
  const roomRef = useRef<QuoridorRoom | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const notice = useNotice();
  const mySide: Side = room?.black_player === userId ? 'black' : 'blue';
  const flipped = mySide === 'black';
  const playerMoves = legalMoves(state, mySide);
  const waiting = room?.status === 'waiting';
  const locked = Boolean(winner || thinking || waiting || turn !== mySide);

  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return mySide === 'blue'
      ? { name: room.black_name || 'Игрок', avatar: room.black_avatar || undefined, multiplayer: true }
      : { name: room.blue_name || 'Игрок', avatar: room.blue_avatar || undefined, multiplayer: true };
  }, [mySide, room]);

  const toDisplayPosition = (position: Position): Position => flipped ? { row: 8 - position.row, col: 8 - position.col } : position;
  const toLogicalPosition = toDisplayPosition;
  const toDisplayWall = (wall: Wall): Wall => flipped ? { ...wall, row: 7 - wall.row, col: 7 - wall.col } : wall;
  const toLogicalWall = toDisplayWall;

  const finish = (side: Side) => {
    setWinner(side);
    telegram.notify(side === mySide ? 'success' : 'error');
  };

  const completeLocalTurn = (next: GameState, side: Side) => {
    setState(next);
    if (next[side].row === (side === 'blue' ? 0 : 8)) return finish(side);
    setTurn(opponentOf(side));
  };

  const syncRoom = (next: QuoridorRoom, currentUserId: string) => {
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
    roomRef.current = next;
    setRoom(next);
    setState({ ...next.state, blue: { ...next.state.blue }, black: { ...next.state.black }, walls: next.state.walls.map((wall) => ({ ...wall })) });
    setWalls({ blue: next.blue_walls, black: next.black_walls });
    setTurn(next.turn);
    setWinner(next.winner);
    setThinking(false);
    setMode('move');
    setPreview(null);
    if (previous?.status !== 'finished' && next.status === 'finished' && next.winner) {
      const side: Side = next.black_player === currentUserId ? 'black' : 'blue';
      telegram.notify(next.winner === side ? 'success' : 'error');
    }
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`quoridor-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quoridor_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validRoom(next)) syncRoom(next, currentUserId);
      })
      .subscribe();
  };

  const connectRoom = async (id: string) => {
    const user: User = await ensureAnonymousUser();
    setUserId(user.id);
    const profile = telegramProfile();
    const { data, error } = await supabase.rpc('join_quoridor_room', { room_id: id, player_name: profile?.name ?? 'Игрок', player_avatar: profile?.photoUrl ?? null });
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

  const commitTurn = async (next: GameState, nextWalls: WallCounts, side: Side) => {
    const nextWinner = next[side].row === (side === 'blue' ? 0 : 8) ? side : null;
    if (!roomRef.current) {
      setWalls(nextWalls);
      completeLocalTurn(next, side);
      return;
    }
    const activeRoom = roomRef.current;
    setState(next);
    setWalls(nextWalls);
    setTurn(opponentOf(side));
    setWinner(nextWinner);
    setThinking(true);
    const { data, error } = await supabase.rpc('make_quoridor_move', {
      room_id: activeRoom.id,
      next_state: next,
      next_blue_walls: nextWalls.blue,
      next_black_walls: nextWalls.black,
      next_winner: nextWinner,
    });
    if (error || !validRoom(data)) {
      syncRoom(activeRoom, userId ?? '');
      notice.show(errorMessage(error, 'Ход не прошёл'));
      return;
    }
    syncRoom(data, userId ?? '');
  };

  const runBotTurn = useEffectEvent(() => {
    setThinking(true);
      const blueDistance = distanceToGoal(state, 'blue');
      const blackDistance = distanceToGoal(state, 'black');
      const wallOptions = walls.black > 0
        ? Array.from({ length: 128 }, (_, index) => ({ orientation: index < 64 ? 'horizontal' as const : 'vertical' as const, row: Math.floor((index % 64) / 8), col: index % 8 }))
          .filter((wall) => canPlaceWall(state, wall))
          .map((wall) => {
            const next = { ...state, walls: [...state.walls, { ...wall, side: 'black' as const }] };
            const nextBlueDistance = distanceToGoal(next, 'blue');
            const nextBlackDistance = distanceToGoal(next, 'black');
            const distanceFromBlue = Math.abs(wall.row - state.blue.row) + Math.abs(wall.col - state.blue.col);
            return { next, blueGain: nextBlueDistance - blueDistance, score: (nextBlueDistance - blueDistance) * 100 - Math.max(0, nextBlackDistance - blackDistance) * 30 - distanceFromBlue };
          })
          .sort((a, b) => b.score - a.score)
        : [];
      const usefulWalls = wallOptions.filter((option) => option.blueGain > 0);
      const bestWall = usefulWalls.length ? usefulWalls[botTurnRef.current++ % Math.min(usefulWalls.length, 4)] : null;
      if (bestWall && blueDistance <= blackDistance + 1) {
        setWalls((current) => ({ ...current, black: current.black - 1 }));
        completeLocalTurn(bestWall.next, 'black');
        setThinking(false);
        return;
      }
      const moves = legalMoves(state, 'black');
      const choice = [...moves].sort((a, b) => distanceToGoal({ ...state, black: a }, 'black') - distanceToGoal({ ...state, black: b }, 'black'))[0];
      if (choice) completeLocalTurn({ ...state, black: choice }, 'black');
      setThinking(false);
  });

  useEffect(() => {
    if (room || turn !== 'black' || winner) return;
    const timer = window.setTimeout(() => {
      runBotTurn();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [room, turn, winner]);

  const pointFor = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = clamp(Math.floor((event.clientX - rect.left) / rect.width * 9), 0, 8);
    const row = clamp(Math.floor((event.clientY - rect.top) / rect.height * 9), 0, 8);
    return { row, col, x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const previewWall = (drag: Drag, point: Drag): Wall | null => {
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (Math.hypot(dx, dy) < 14) return null;
    const orientation: Wall['orientation'] = Math.abs(dx) >= Math.abs(dy) ? 'vertical' : 'horizontal';
    const displayWall: Wall = orientation === 'vertical'
      ? { orientation, row: clamp(drag.row, 0, 7), col: clamp(dx < 0 ? drag.col - 1 : drag.col, 0, 7), side: mySide }
      : { orientation, row: clamp(dy < 0 ? drag.row - 1 : drag.row, 0, 7), col: clamp(drag.col, 0, 7), side: mySide };
    return toLogicalWall(displayWall);
  };

  const wallStyle = (wall: Wall) => wall.orientation === 'horizontal'
    ? { left: `${wall.col * 100 / 9}%`, top: `${(wall.row + 1) * 100 / 9}%`, width: `calc(${200 / 9}% + 3px)` }
    : { left: `${(wall.col + 1) * 100 / 9}%`, top: `${wall.row * 100 / 9}%`, height: `calc(${200 / 9}% + 3px)` };

  const wallAtPointer = (event: React.PointerEvent<HTMLElement>, orientation: Wall['orientation']): Wall | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    const offsetY = event.clientY - 24;
    if (!rect || event.clientX < rect.left || event.clientX > rect.right || offsetY < rect.top || offsetY > rect.bottom) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (offsetY - rect.top) / rect.height;
    const displayWall: Wall = orientation === 'horizontal'
      ? { orientation, row: clamp(Math.round(y * 9) - 1, 0, 7), col: clamp(Math.floor(x * 9), 0, 7), side: mySide }
      : { orientation, row: clamp(Math.floor(y * 9), 0, 7), col: clamp(Math.round(x * 9) - 1, 0, 7), side: mySide };
    return toLogicalWall(displayWall);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const point = pointFor(event);
    if (!point) return;
    dragRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'wall') return;
    const drag = dragRef.current;
    const point = pointFor(event);
    if (!drag || !point) return;
    setPreview(previewWall(drag, point));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = pointFor(event);
    dragRef.current = null;
    setPreview(null);
    if (!drag || !point || locked) return;
    const wall = previewWall(drag, point);
    if (mode === 'wall') {
      if (!wall) return;
      if (!walls[mySide] || !canPlaceWall(state, wall)) return telegram.notify('warning');
      telegram.impact('medium');
      const nextWalls = { ...walls, [mySide]: walls[mySide] - 1 };
      void commitTurn({ ...state, walls: [...state.walls, wall] }, nextWalls, mySide);
      return;
    }
    const target = toLogicalPosition({ row: point.row, col: point.col });
    if (!playerMoves.some((move) => equal(move, target))) return;
    telegram.impact('light');
    void commitTurn({ ...state, [mySide]: target }, walls, mySide);
  };

  const beginWallDrag = (orientation: Wall['orientation'], event: React.PointerEvent<HTMLButtonElement>) => {
    if (locked || walls[mySide] === 0) return;
    event.preventDefault();
    wallDragRef.current = { orientation, wall: null };
    setMode('wall');
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveWallDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = wallDragRef.current;
    if (!drag) return;
    const wall = wallAtPointer(event, drag.orientation);
    drag.wall = wall;
    setPreview(wall);
  };

  const endWallDrag = () => {
    const drag = wallDragRef.current;
    wallDragRef.current = null;
    setMode('move');
    setPreview(null);
    if (!drag?.wall) return;
    if (!canPlaceWall(state, drag.wall)) return telegram.notify('warning');
    telegram.impact('medium');
    const nextWalls = { ...walls, [mySide]: walls[mySide] - 1 };
    void commitTurn({ ...state, walls: [...state.walls, drag.wall] }, nextWalls, mySide);
  };

  const restart = async () => {
    telegram.impact('light');
    if (roomRef.current) {
      const { data, error } = await supabase.rpc('restart_quoridor_room', { room_id: roomRef.current.id });
      if (error || !validRoom(data)) return notice.show(errorMessage(error, 'Не удалось начать новую игру'));
      syncRoom(data, userId ?? '');
      return;
    }
    botTurnRef.current = 0;
    setState(initialState());
    setTurn('blue');
    setWalls({ blue: 10, black: 10 });
    setWinner(null);
    setThinking(false);
    setMode('move');
    setPreview(null);
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      let activeRoom = roomRef.current;
      if (!activeRoom) {
        const user = await ensureAnonymousUser();
        setUserId(user.id);
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_quoridor_room', { player_name: profile?.name ?? 'Игрок', player_avatar: profile?.photoUrl ?? null });
        if (error) throw error;
        if (!validRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        window.history.replaceState(null, '', `/games/quoridor?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id, user.id);
        syncRoom(data, user.id);
      }
      const outcome = await shareGameInvite({ title: 'Коридор', text: 'Сыграем в Коридор?', startParam: `quoridor_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось создать приглашение'));
    }
  };

  const status = winner ? (winner === mySide ? 'Победа' : 'Поражение') : waiting ? '' : turn === mySide ? 'Твой ход' : 'Ход соперника';
  const statusColor = winner ?? turn;
  const wallIsValid = preview ? canPlaceWall(state, preview) && walls[mySide] > 0 : true;

  return <GameShell
    title="Коридор"
    opponent={opponent}
    onInvite={invite}
    notice={notice.message}
    status={status}
    statusMuted={statusColor === 'black'}
    game={<div className={`quoridor-board quoridor-board--${mode}`} ref={boardRef} data-game-input onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; setPreview(null); }}>
      {Array.from({ length: 81 }, (_, index) => {
        const displayPosition = { row: Math.floor(index / 9), col: index % 9 };
        const position = toLogicalPosition(displayPosition);
        const player = equal(position, state.blue) ? 'blue' : equal(position, state.black) ? 'black' : null;
        const available = mode === 'move' && !locked && playerMoves.some((move) => equal(move, position));
        return <span key={index} className={`quoridor-cell${available ? ` is-available is-available--${mySide}` : ''}`}>{player ? <i className={`quoridor-piece quoridor-piece--${player}`} /> : null}</span>;
      })}
      {state.walls.map((wall, index) => {
        const displayWall = toDisplayWall(wall);
        return <i key={`${wall.orientation}-${wall.row}-${wall.col}-${index}`} className={`quoridor-wall quoridor-wall--${displayWall.orientation} quoridor-wall--${wall.side ?? 'black'}`} style={wallStyle(displayWall)} />;
      })}
      {preview ? (() => {
        const displayWall = toDisplayWall(preview);
        return <i className={`quoridor-wall quoridor-wall--${displayWall.orientation} quoridor-wall--${mySide} is-preview${wallIsValid ? '' : ' is-invalid'}`} style={wallStyle(displayWall)} />;
      })() : null}
    </div>}
    footer={winner ? <GameFooter variant="button" onPlayAgain={() => void restart()} /> : <GameFooter variant="custom" className="quoridor-footer">
      <div className="quoridor-wall-choices" aria-label="Выбор стены">
        <button type="button" className={`quoridor-wall-choice quoridor-wall-choice--horizontal quoridor-wall-choice--${mySide}`} aria-label="Горизонтальная стена" disabled={locked || walls[mySide] === 0} onPointerDown={(event) => beginWallDrag('horizontal', event)} onPointerMove={moveWallDrag} onPointerUp={endWallDrag} onPointerCancel={endWallDrag}><i /></button>
        <button type="button" className={`quoridor-wall-choice quoridor-wall-choice--vertical quoridor-wall-choice--${mySide}`} aria-label="Вертикальная стена" disabled={locked || walls[mySide] === 0} onPointerDown={(event) => beginWallDrag('vertical', event)} onPointerMove={moveWallDrag} onPointerUp={endWallDrag} onPointerCancel={endWallDrag}><i /></button>
      </div>
    </GameFooter>}
  />;
}
