'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { classNames } from '../../lib/class-names';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';
import { availableColumns, boardChange, chooseRobotColumn, connectFourColumns, emptyConnectFourBoard, findWinningLine, firstOpenRow, placeChip, type BoardPosition, type Chip, type ConnectFourBoard } from './engine';

type ConnectFourRoom = {
  id: string;
  blue_player: string;
  black_player: string | null;
  blue_name: string | null;
  black_name: string | null;
  blue_avatar: string | null;
  black_avatar: string | null;
  status: 'waiting' | 'active' | 'finished';
  turn: Chip;
  winner: Chip | 'draw' | null;
  board: ConnectFourBoard;
  preview_player: string | null;
  preview_column: number | null;
  updated_at?: string;
};

function validRoom(value: unknown): value is ConnectFourRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<ConnectFourRoom>;
  return typeof room.id === 'string' && Array.isArray(room.board) && room.board.length === 6 && room.board.every((row) => Array.isArray(row) && row.length === 7);
}

const wait = (delay: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delay));

export function ConnectFourGame({ initialRoomId }: { initialRoomId?: string }) {
  const [board, setBoard] = useState<ConnectFourBoard>(emptyConnectFourBoard);
  const [selected, setSelected] = useState(3);
  const [locked, setLocked] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [localTurn, setLocalTurn] = useState<Chip>('blue');
  const [status, setStatus] = useState('Твой ход');
  const [winner, setWinner] = useState<Chip | 'draw' | null>(null);
  const [winningLine, setWinningLine] = useState<BoardPosition[]>([]);
  const [room, setRoom] = useState<ConnectFourRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  const boardElementRef = useRef<HTMLDivElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const holeLayerRef = useRef<HTMLDivElement>(null);
  const bodyLayerRef = useRef<HTMLDivElement>(null);
  const fallingRef = useRef<HTMLSpanElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<ConnectFourRoom | null>(null);
  const boardRef = useRef(board);
  const mountedRef = useRef(true);
  const animationsRef = useRef(new Set<Animation>());
  const pendingMoveRef = useRef<{ row: number; column: number; chip: Chip } | null>(null);
  const remoteQueueRef = useRef(Promise.resolve());
  const robotTurnRef = useRef(0);
  const boardPointerRef = useRef<{ id: number; column: number } | null>(null);
  const suppressColumnClickRef = useRef(false);

  useEffect(() => { preloadGameSounds(['/sounds/connect-four-land.wav']); }, []);
  useEffect(() => () => telegram.setVerticalSwipes(false), []);

  const myChip: Chip = room?.blue_player === userId ? 'blue' : room?.black_player === userId ? 'black' : 'blue';
  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return myChip === 'blue'
      ? { name: room.black_name || 'Игрок', avatar: room.black_avatar || undefined, multiplayer: true }
      : { name: room.blue_name || 'Игрок', avatar: room.blue_avatar || undefined, multiplayer: true };
  }, [myChip, room]);
  const remotePreview = room?.status === 'active' && room.turn !== myChip && room.preview_player && room.preview_player !== userId && Number.isInteger(room.preview_column) ? room.preview_column : null;
  const previewColumn = remotePreview ?? selected;
  const previewChip: Chip = room?.status === 'active' ? room.turn : room ? myChip : localTurn;
  const statusChip: Chip | 'draw' = winner ?? (room?.status === 'active' ? room.turn : localTurn);

  useEffect(() => { boardRef.current = board; }, [board]);

  useLayoutEffect(() => {
    const boardElement = boardElementRef.current;
    const sheet = sheetRef.current;
    const holes = holeLayerRef.current;
    const body = bodyLayerRef.current;
    if (!boardElement || !sheet || !holes || !body) return;

    const rebuildFace = () => {
      const sheetRect = sheet.getBoundingClientRect();
      const cellRects = Array.from(boardElement.children, (cell) => cell.getBoundingClientRect());
      holes.replaceChildren();
      cellRects.forEach((rect) => {
        const hole = document.createElement('span');
        hole.className = 'connect-hole';
        Object.assign(hole.style, {
          left: `${rect.left - sheetRect.left}px`, top: `${rect.top - sheetRect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
        });
        holes.append(hole);
      });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${sheetRect.width} ${sheetRect.height}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'display:block;width:100%;height:100%';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const holePaths = cellRects.map((rect) => {
        const radius = rect.width / 2;
        const x = rect.left - sheetRect.left + radius;
        const y = rect.top - sheetRect.top + radius;
        return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 -${radius * 2} 0`;
      }).join(' ');
      path.setAttribute('d', `M 0 0 H ${sheetRect.width} V ${sheetRect.height} H 0 Z ${holePaths}`);
      path.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim());
      path.setAttribute('fill-rule', 'evenodd');
      svg.append(path);
      body.replaceChildren(svg);
    };

    rebuildFace();
    const observer = new ResizeObserver(rebuildFace);
    observer.observe(boardElement);
    window.addEventListener('blitzzz-theme-change', rebuildFace);
    return () => {
      observer.disconnect();
      window.removeEventListener('blitzzz-theme-change', rebuildFace);
    };
  }, []);

  useLayoutEffect(() => {
    const falling = fallingRef.current;
    if (!falling) return;
    fallingRef.current = null;
    falling.remove();
    setDropping(false);
    telegram.impact('medium');
  }, [board]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    const boardElement = boardElementRef.current;
    const sheet = sheetRef.current;
    const column = previewColumn ?? 3;
    if (!preview || !boardElement || !sheet || winner || firstOpenRow(board, column) < 0) return;
    const target = boardElement.children[column] as HTMLElement | undefined;
    const targetRow = firstOpenRow(board, column);
    const landingCell = boardElement.children[targetRow * connectFourColumns + column] as HTMLElement | undefined;
    if (!target || !landingCell) return;
    const targetRect = target.getBoundingClientRect();
    const landingRect = landingCell.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const trailInset = 2;
    const previewTop = -40 - targetRect.width - trailInset;
    Object.assign(preview.style, {
      left: `${targetRect.left - sheetRect.left - trailInset}px`,
      top: `${previewTop}px`,
      width: `${targetRect.width + trailInset * 2}px`,
      height: `${landingRect.bottom - sheetRect.top - previewTop}px`,
    });
  }, [board, dropping, previewColumn, winner]);

  const animateDrop = async (column: number, row: number, chip: Chip) => {
    const boardElement = boardElementRef.current;
    const sheet = sheetRef.current;
    const target = boardElement?.children[row * connectFourColumns + column] as HTMLElement | undefined;
    if (!target || !sheet) return;
    const targetRect = target.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const previewRect = previewRef.current?.getBoundingClientRect();
    const falling = document.createElement('span');
    falling.className = `connect-falling-chip connect-falling-chip--${chip}`;
    fallingRef.current?.remove();
    fallingRef.current = falling;
    const startTop = previewRect ? previewRect.top - sheetRect.top + 2 : -targetRect.height - 40;
    Object.assign(falling.style, { width: `${targetRect.width}px`, height: `${targetRect.height}px`, left: `${targetRect.left - sheetRect.left}px`, top: `${startTop}px` });
    sheet.append(falling);
    setDropping(true);
    const distance = targetRect.top - sheetRect.top - startTop;
    const animation = falling.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-16px)', offset: .2, easing: 'cubic-bezier(.2,0,.2,1)' },
      { transform: `translateY(${distance}px)`, easing: 'cubic-bezier(.16,.72,.28,1)' },
    ], { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 480, fill: 'forwards' });
    animationsRef.current.add(animation);
    await animation.finished.catch(() => undefined);
    animationsRef.current.delete(animation);
    playGameSound('/sounds/connect-four-land.wav', .25);
  };

  const finish = (nextWinner: Chip | 'draw', line: BoardPosition[] = []) => {
    setWinner(nextWinner);
    setWinningLine(line);
    setLocked(true);
    const didWin = nextWinner === myChip;
    setStatus(nextWinner === 'draw' ? 'Ничья' : didWin ? 'Победа' : 'Поражение');
    telegram.notify(nextWinner === 'draw' ? 'warning' : didWin ? 'success' : 'error');
  };

  const applyRoom = (next: ConnectFourRoom, currentUserId: string) => {
    if (!mountedRef.current) return;
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
    roomRef.current = next;
    boardRef.current = next.board.map((row) => [...row]);
    setRoom(next);
    setBoard(boardRef.current);
    const chip: Chip = next.blue_player === currentUserId ? 'blue' : 'black';
    if (next.status === 'finished' && next.winner) {
      setWinner(next.winner);
      setLocked(true);
      setStatus(next.winner === 'draw' ? 'Ничья' : next.winner === chip ? 'Победа' : 'Поражение');
      return;
    }
    setWinner(null);
    setWinningLine([]);
    const waiting = next.status === 'waiting';
    const isLocked = waiting || next.turn !== chip;
    setLocked(isLocked);
    setStatus(waiting ? '' : isLocked ? 'Ход соперника' : 'Твой ход');
    if (!isLocked) setSelected(firstOpenRow(next.board, 3) >= 0 ? 3 : availableColumns(next.board)[0] ?? 3);
  };

  const processRemoteRoom = async (next: ConnectFourRoom, currentUserId: string) => {
    const change = boardChange(boardRef.current, next.board);
    const pending = pendingMoveRef.current;
    if (change && pending && pending.row === change.row && pending.column === change.column && pending.chip === change.chip) return;
    if (change && (!pending || pending.row !== change.row || pending.column !== change.column || pending.chip !== change.chip)) {
      setLocked(true);
      await animateDrop(change.column, change.row, change.chip);
    }
    applyRoom(next, currentUserId);
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`connect-four-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'connect_four_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (!validRoom(next)) return;
        remoteQueueRef.current = remoteQueueRef.current.then(() => processRemoteRoom(next, currentUserId));
      })
      .subscribe();
  };

  const connectRoom = async (id: string) => {
    const user = await ensureAnonymousUser();
    setUserId(user.id);
    const { data: existing, error } = await supabase.from('connect_four_rooms').select('*').eq('id', id).single();
    if (error || !validRoom(existing)) throw new Error('Приглашение больше не действует');
    let activeRoom = existing;
    if (existing.blue_player !== user.id && existing.black_player !== user.id) {
      const profile = telegramProfile();
      const joined = await supabase.rpc('join_connect_four_room', { room_id: id, player_name: profile?.name ?? 'Игрок', player_avatar: profile?.photoUrl ?? null });
      if (joined.error) throw joined.error;
      if (!validRoom(joined.data)) throw new Error('Сервер вернул некорректное состояние игры');
      activeRoom = joined.data;
    }
    subscribe(id, user.id);
    applyRoom(activeRoom, user.id);
  };

  const connectToInitialRoom = useEffectEvent((id: string) => {
    void connectRoom(id).catch((error) => notice.show(errorMessage(error, 'Не удалось открыть игру')));
  });

  useEffect(() => {
    mountedRef.current = true;
    const animations = animationsRef.current;
    const connectTimer = initialRoomId ? window.setTimeout(() => {
      connectToInitialRoom(initialRoomId);
    }, 0) : null;
    return () => {
      mountedRef.current = false;
      if (connectTimer !== null) window.clearTimeout(connectTimer);
      void channelRef.current?.unsubscribe();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      fallingRef.current?.remove();
      fallingRef.current = null;
    };
  }, [initialRoomId]);

  const moveSelectionThroughColumns = async (column: number) => {
    let current = selected;
    const direction = Math.sign(column - current);
    while (direction && current !== column) {
      current += direction;
      setSelected(current);
      telegram.selectionChanged();
      publishPreview(current);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await wait(10);
    }
  };

  const columnAtPointer = (clientX: number) => {
    const rect = boardWrapRef.current?.getBoundingClientRect();
    if (!rect) return selected;
    return Math.max(0, Math.min(connectFourColumns - 1, Math.floor(((clientX - rect.left) / rect.width) * connectFourColumns)));
  };

  const selectColumnFromPointer = (column: number) => {
    if (column === boardPointerRef.current?.column) return;
    boardPointerRef.current = boardPointerRef.current ? { ...boardPointerRef.current, column } : null;
    setSelected(column);
    telegram.selectionChanged();
    publishPreview(column);
  };

  const beginBoardDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (locked || winner) return;
    const column = columnAtPointer(event.clientX);
    boardPointerRef.current = { id: event.pointerId, column };
    suppressColumnClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    telegram.setVerticalSwipes(true);
    setSelected(column);
    publishPreview(column);
  };

  const moveBoardDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = boardPointerRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    selectColumnFromPointer(columnAtPointer(event.clientX));
  };

  const endBoardDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = boardPointerRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    boardPointerRef.current = null;
    telegram.setVerticalSwipes(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === 'pointercancel') return;
    event.preventDefault();
    suppressColumnClickRef.current = true;
    void play(drag.column);
  };

  const runRobot = (current: ConnectFourBoard) => {
    const turn = ++robotTurnRef.current;
    const start = firstOpenRow(current, 3) >= 0 ? 3 : availableColumns(current)[0] ?? 3;
    setLocked(true);
    setStatus('Ход соперника');
    setLocalTurn('black');
    setSelected(start);
    timers.schedule(() => {
      void (async () => {
        await wait(1000);
        if (!mountedRef.current || robotTurnRef.current !== turn) return;
        const column = chooseRobotColumn(current);
        let previewColumn = start;
        const direction = Math.sign(column - previewColumn);
        while (direction && previewColumn !== column) {
          previewColumn += direction;
          setSelected(previewColumn);
          await wait(90);
          if (!mountedRef.current || robotTurnRef.current !== turn) return;
        }
        await wait(220);
        if (!mountedRef.current || robotTurnRef.current !== turn) return;
        const placed = placeChip(current, column, 'black');
        if (!placed) return;
        await animateDrop(column, placed.row, 'black');
        if (!mountedRef.current || robotTurnRef.current !== turn) return;
        setBoard(placed.board);
        const line = findWinningLine(placed.board, placed.row, column, 'black');
        if (line) return finish('black', line);
        if (placed.board.flat().every(Boolean)) return finish('draw');
        setLocalTurn('blue');
        setSelected(firstOpenRow(placed.board, 3) >= 0 ? 3 : availableColumns(placed.board)[0] ?? 3);
        setLocked(false);
        setStatus('Твой ход');
      })();
    }, 520);
  };

  const play = async (column: number) => {
    if (locked || winner || firstOpenRow(board, column) < 0) return;
    const chip = room ? myChip : 'blue';
    if (room && (room.turn !== chip || room.status !== 'active')) return;
    telegram.impact('light');
    const placed = placeChip(board, column, chip);
    if (!placed) return;
    setLocked(true);
    await moveSelectionThroughColumns(column);
    if (!mountedRef.current) return;
    await wait(200);
    if (!mountedRef.current) return;
    pendingMoveRef.current = { row: placed.row, column, chip };
    const request = room ? supabase.rpc('make_connect_four_move', { room_id: room.id, selected_column: column }) : null;
    await animateDrop(column, placed.row, chip);
    boardRef.current = placed.board;
    setBoard(placed.board);
    if (request) {
      const { data, error } = await request;
      pendingMoveRef.current = null;
      if (error) {
        setBoard(room?.board.map((row) => [...row]) ?? board);
        setLocked(false);
        notice.show('Ход не прошёл');
      } else if (validRoom(data) && userId) applyRoom(data, userId);
      return;
    }
    pendingMoveRef.current = null;
    const line = findWinningLine(placed.board, placed.row, column, chip);
    if (line) return finish(chip, line);
    if (placed.board.flat().every(Boolean)) return finish('draw');
    runRobot(placed.board);
  };

  const publishPreview = (column: number) => {
    if (!room || locked || room.status !== 'active' || room.turn !== myChip) return;
    void supabase.rpc('set_connect_four_preview', { room_id: room.id, selected_column: column });
  };

  const restart = async () => {
    telegram.impact('light');
    if (room) {
      const { data, error } = await supabase.rpc('restart_connect_four_room', { room_id: room.id });
      if (error) return notice.show('Не удалось начать новую игру');
      if (validRoom(data) && userId) applyRoom(data, userId);
      return;
    }
    timers.clearAll();
    robotTurnRef.current += 1;
    const empty = emptyConnectFourBoard();
    boardRef.current = empty;
    setBoard(empty);
    setSelected(3);
    setLocalTurn('blue');
    setLocked(false);
    setWinner(null);
    setWinningLine([]);
    setStatus('Твой ход');
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      let activeRoom = room;
      if (!activeRoom) {
        const user = await ensureAnonymousUser();
        setUserId(user.id);
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_connect_four_room', { player_name: profile?.name ?? 'Игрок', player_avatar: profile?.photoUrl ?? null });
        if (error) throw error;
        if (!validRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        window.history.replaceState(null, '', `/games/four-in-a-row?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id, user.id);
        applyRoom(data, user.id);
      }
      const outcome = await shareGameInvite({ title: 'Четыре в ряд', text: 'Сыграем в Четыре в ряд?', startParam: `game_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось создать приглашение'));
    }
  };

  return (
    <GameShell
      title="Четыре в ряд"
      opponent={opponent}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={statusChip === 'black' || statusChip === 'draw'}
      game={
        <section className="connect-sheet" ref={sheetRef} aria-label="Игровое поле">
          <div className="connect-hole-layer" ref={holeLayerRef} aria-hidden="true" />
          {!dropping && !winner && firstOpenRow(board, previewColumn ?? 3) >= 0 && <span ref={previewRef} className={`connect-preview connect-preview--${previewChip}`} aria-hidden="true" />}
          <div className="connect-body-layer" ref={bodyLayerRef} aria-hidden="true" />
          <div className="connect-board-wrap" ref={boardWrapRef} data-game-input onPointerDown={beginBoardDrag} onPointerMove={moveBoardDrag} onPointerUp={endBoardDrag} onPointerCancel={endBoardDrag}>
            <div className="connect-board" ref={boardElementRef} aria-hidden="true">
              {board.flatMap((row, rowIndex) => row.map((chip, column) => {
                const isHint = !locked && !chip && rowIndex === firstOpenRow(board, column) && column === selected;
                const isWinning = winningLine.some(([lineRow, lineColumn]) => lineRow === rowIndex && lineColumn === column);
                return <span key={`${rowIndex}-${column}`} className={classNames('connect-cell', chip && `connect-cell--${chip}`, isHint && `is-hint-${myChip}`, isWinning && 'is-winning')} />;
              }))}
            </div>
            <div className="connect-column-buttons">
              {Array.from({ length: connectFourColumns }, (_, column) => <button key={column} type="button" aria-label={`Положить фишку в столбец ${column + 1}`} disabled={locked || firstOpenRow(board, column) < 0} onClick={() => {
                if (suppressColumnClickRef.current) {
                  suppressColumnClickRef.current = false;
                  return;
                }
                void play(column);
              }} />)}
            </div>
          </div>
        </section>
      }
      footer={winner ? <GameFooter variant="button" onPlayAgain={restart} /> : <GameFooter variant="empty" />}
    />
  );
}
