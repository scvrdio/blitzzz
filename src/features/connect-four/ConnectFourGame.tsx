'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { GameShell } from '../../components/game/GameShell';
import { GameStatus } from '../../components/game/GameStatus';
import { RestartButton } from '../../components/game/RestartButton';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { classNames } from '../../lib/class-names';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
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

export function ConnectFourGame({ initialRoomId }: { initialRoomId?: string }) {
  const [board, setBoard] = useState<ConnectFourBoard>(emptyConnectFourBoard);
  const [selected, setSelected] = useState(3);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState('Твой ход');
  const [winner, setWinner] = useState<Chip | 'draw' | null>(null);
  const [winningLine, setWinningLine] = useState<BoardPosition[]>([]);
  const [room, setRoom] = useState<ConnectFourRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  const boardElementRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<ConnectFourRoom | null>(null);
  const boardRef = useRef(board);
  const mountedRef = useRef(true);
  const animationsRef = useRef(new Set<Animation>());
  const pendingMoveRef = useRef<{ row: number; column: number; chip: Chip } | null>(null);
  const remoteQueueRef = useRef(Promise.resolve());

  const myChip: Chip = room?.blue_player === userId ? 'blue' : room?.black_player === userId ? 'black' : 'blue';
  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return myChip === 'blue'
      ? { name: room.black_name || 'Соперник', avatar: room.black_avatar || undefined }
      : { name: room.blue_name || 'Соперник', avatar: room.blue_avatar || undefined };
  }, [myChip, room]);

  useEffect(() => { boardRef.current = board; }, [board]);

  const animateDrop = async (column: number, row: number, chip: Chip) => {
    const boardElement = boardElementRef.current;
    const sheet = sheetRef.current;
    const target = boardElement?.children[row * connectFourColumns + column] as HTMLElement | undefined;
    if (!target || !sheet) return;
    const targetRect = target.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const falling = document.createElement('span');
    falling.className = `connect-falling-chip connect-falling-chip--${chip}`;
    Object.assign(falling.style, { width: `${targetRect.width}px`, height: `${targetRect.height}px`, left: `${targetRect.left - sheetRect.left}px`, top: `${-targetRect.height - 8}px` });
    sheet.append(falling);
    const distance = targetRect.top - sheetRect.top + targetRect.height + 8;
    const animation = falling.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-16px)', offset: .2, easing: 'cubic-bezier(.2,0,.2,1)' },
      { transform: `translateY(${distance}px)`, easing: 'cubic-bezier(.16,.72,.28,1)' },
    ], { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 480, fill: 'forwards' });
    animationsRef.current.add(animation);
    await animation.finished.catch(() => undefined);
    animationsRef.current.delete(animation);
    falling.remove();
    telegram.impact('medium');
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
      telegram.setVerticalSwipes(false);
    };
  }, [initialRoomId]);

  const runRobot = (current: ConnectFourBoard) => {
    setLocked(true);
    setStatus('Ход соперника');
    timers.schedule(() => {
      const column = chooseRobotColumn(current);
      setSelected(column);
      timers.schedule(async () => {
        const placed = placeChip(current, column, 'black');
        if (!placed) return;
        await animateDrop(column, placed.row, 'black');
        setBoard(placed.board);
        const line = findWinningLine(placed.board, placed.row, column, 'black');
        if (line) return finish('black', line);
        if (placed.board.flat().every(Boolean)) return finish('draw');
        setSelected(firstOpenRow(placed.board, 3) >= 0 ? 3 : availableColumns(placed.board)[0] ?? 3);
        setLocked(false);
        setStatus('Твой ход');
      }, 300);
    }, 520);
  };

  const play = async (column: number) => {
    if (locked || winner || firstOpenRow(board, column) < 0) return;
    const chip = room ? myChip : 'blue';
    if (room && (room.turn !== chip || room.status !== 'active')) return;
    telegram.impact('light');
    const placed = placeChip(board, column, chip);
    if (!placed) return;
    setSelected(column);
    setLocked(true);
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
    const empty = emptyConnectFourBoard();
    boardRef.current = empty;
    setBoard(empty);
    setSelected(3);
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

  const remotePreview = room?.status === 'active' && room.turn !== myChip && room.preview_player && room.preview_player !== userId && Number.isInteger(room.preview_column) ? room.preview_column : null;
  const previewColumn = remotePreview ?? selected;
  const previewChip: Chip = remotePreview === null ? myChip : room?.turn ?? 'black';

  return (
    <GameShell title="Четыре в ряд" opponent={opponent} onInvite={invite} notice={notice.message}>
      <section className="game-content connect-game">
        <GameStatus muted={locked || winner === 'black'}>{status}</GameStatus>
        <div className="connect-drop-zone" aria-hidden="true" />
        <section className="connect-sheet" ref={sheetRef} aria-label="Игровое поле">
          {!winner && firstOpenRow(board, previewColumn ?? 3) >= 0 && <span className={`connect-preview connect-preview--${previewChip}`} style={{ left: `calc(${(previewColumn ?? 3) * (100 / 7)}% + ${100 / 14}% - 12px)` }} aria-hidden="true" />}
          <div className="connect-board-wrap">
            <div className="connect-board" ref={boardElementRef} aria-hidden="true">
              {board.flatMap((row, rowIndex) => row.map((chip, column) => {
                const isHint = !locked && !chip && rowIndex === firstOpenRow(board, column) && column === selected;
                const isWinning = winningLine.some(([lineRow, lineColumn]) => lineRow === rowIndex && lineColumn === column);
                return <span key={`${rowIndex}-${column}`} className={classNames('connect-cell', chip && `connect-cell--${chip}`, isHint && `is-hint-${myChip}`, isWinning && 'is-winning')} />;
              }))}
            </div>
            <div className="connect-column-buttons">
              {Array.from({ length: connectFourColumns }, (_, column) => <button key={column} type="button" aria-label={`Положить фишку в столбец ${column + 1}`} disabled={locked || firstOpenRow(board, column) < 0} onClick={() => void play(column)} />)}
            </div>
          </div>
          {!winner && <div className={classNames('connect-slider', myChip === 'black' && 'connect-slider--black', locked && 'is-disabled')}>
            <span className="connect-slider__dots" aria-hidden="true">{Array.from({ length: 7 }, (_, column) => <i key={column} className={column === selected ? 'is-selected' : ''} />)}</span>
            <span className="connect-slider__thumb" style={{ left: `calc(${selected * (100 / 7)}% + ${100 / 14}% - 12px)` }} aria-hidden="true" />
            <input type="range" min="0" max="6" value={selected} aria-label="Выбор столбца" disabled={locked} onPointerDown={() => telegram.setVerticalSwipes(true)} onPointerUp={(event) => { telegram.setVerticalSwipes(false); void play(Number(event.currentTarget.value)); }} onPointerCancel={() => telegram.setVerticalSwipes(false)} onChange={(event) => { const column = Number(event.target.value); if (column !== selected) telegram.selectionChanged(); setSelected(column); publishPreview(column); }} />
          </div>}
          {winner && <RestartButton onClick={restart} />}
        </section>
      </section>
    </GameShell>
  );
}
