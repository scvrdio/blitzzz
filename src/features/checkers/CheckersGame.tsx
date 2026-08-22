'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { GameFooter, type GameFooterSliderValue } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { classNames } from '../../lib/class-names';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { applyCheckerMove, checkerColor, chooseBotMove, completeCheckerTurn, initialCheckersBoard, isKing, legalMoves, pieceMoves, type CheckerCell, type CheckerColor } from './engine';

type CheckersRoom = {
  id: string;
  blue_player: string;
  black_player: string | null;
  blue_name: string | null;
  black_name: string | null;
  status: 'waiting' | 'active' | 'finished';
  turn: CheckerColor;
  winner: CheckerColor | null;
  board: CheckerCell[];
  updated_at?: string;
};

const columns = 'ABCDEFGH';
const rows = '12345678';
const difficultyLabels = ['Очень легко', 'Легко', 'Нормально', 'Сложно', 'Очень сложно'] as const;

function validRoom(value: unknown): value is CheckersRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<CheckersRoom>;
  return typeof room.id === 'string' && Array.isArray(room.board) && room.board.length === 64;
}

export function CheckersGame({ initialRoomId }: { initialRoomId?: string }) {
  const [cells, setCells] = useState<CheckerCell[]>(initialCheckersBoard);
  const [selected, setSelected] = useState<number | null>(null);
  const [chainPiece, setChainPiece] = useState<number | null>(null);
  const [capturedThisTurn, setCapturedThisTurn] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState('Твой ход');
  const [finished, setFinished] = useState<CheckerColor | null>(null);
  const [difficulty, setDifficulty] = useState<GameFooterSliderValue>(2);
  const [started, setStarted] = useState(false);
  const [room, setRoom] = useState<CheckersRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<CheckersRoom | null>(null);
  const mountedRef = useRef(true);

  const myColor: CheckerColor = room?.blue_player === userId ? 'blue' : room?.black_player === userId ? 'black' : 'blue';
  const flipped = Boolean(room && myColor === 'black');
  const available = useMemo(() => selected === null ? [] : legalMoves(myColor, cells, chainPiece, capturedThisTurn).filter((move) => move.from === selected), [capturedThisTurn, cells, chainPiece, myColor, selected]);
  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return { name: myColor === 'blue' ? room.black_name || 'Игрок' : room.blue_name || 'Игрок', multiplayer: true };
  }, [myColor, room]);

  const finish = (winner: CheckerColor) => {
    setFinished(winner);
    setLocked(true);
    setSelected(null);
    setChainPiece(null);
    setCapturedThisTurn([]);
    setStatus(winner === myColor ? 'Победа' : 'Поражение');
    telegram.notify(winner === myColor ? 'success' : 'error');
  };

  const syncRoom = (next: CheckersRoom, currentUserId: string) => {
    if (!mountedRef.current) return;
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
    roomRef.current = next;
    setRoom(next);
    setCells([...next.board]);
    setStarted(true);
    setSelected(null);
    setChainPiece(null);
    setCapturedThisTurn([]);
    const color: CheckerColor = next.blue_player === currentUserId ? 'blue' : 'black';
    if (next.status === 'finished' && next.winner) {
      setFinished(next.winner);
      setLocked(true);
      setStatus(next.winner === color ? 'Победа' : 'Поражение');
      return;
    }
    setFinished(null);
    const waiting = next.status === 'waiting';
    const isLocked = waiting || next.turn !== color;
    setLocked(isLocked);
    setStatus(waiting ? '' : isLocked ? 'Ход соперника' : 'Твой ход');
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`checkers-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkers_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validRoom(next)) syncRoom(next, currentUserId);
      })
      .subscribe();
  };

  const connectRoom = async (id: string) => {
    const user = await ensureAnonymousUser();
    setUserId(user.id);
    const profile = telegramProfile();
    const { data, error } = await supabase.rpc('join_checkers_room', { room_id: id, player_name: profile?.name ?? 'Игрок' });
    if (error) throw error;
    if (!validRoom(data)) throw new Error('Сервер вернул некорректное состояние игры');
    subscribe(id, user.id);
    syncRoom(data, user.id);
    return { user, room: data };
  };

  const connectToInitialRoom = useEffectEvent((id: string) => {
    void connectRoom(id).catch((error) => notice.show(errorMessage(error, 'Не удалось открыть игру')));
  });

  useEffect(() => {
    mountedRef.current = true;
    const connectTimer = initialRoomId ? window.setTimeout(() => {
      connectToInitialRoom(initialRoomId);
    }, 0) : null;
    return () => {
      mountedRef.current = false;
      if (connectTimer !== null) window.clearTimeout(connectTimer);
      void channelRef.current?.unsubscribe();
    };
  }, [initialRoomId]);

  const runBotMove = (board: CheckerCell[], only: number | null, delay: number, captured: readonly number[] = []) => {
    setLocked(true);
    setStatus('Ход соперника');
    timers.schedule(() => {
      const move = chooseBotMove(board, difficulty, only, captured);
      if (!move) return finish('blue');
      const nextCaptured = move.capture === null ? captured : [...captured, move.capture];
      const nextStep = applyCheckerMove(board, move, false);
      setCells(nextStep);
      if (move.capture !== null) telegram.impact('medium');
      const follow = move.capture === null ? [] : pieceMoves(move.to, true, nextStep, nextCaptured);
      if (follow.length) return runBotMove(nextStep, move.to, 240, nextCaptured);
      const next = completeCheckerTurn(nextStep, nextCaptured);
      setCells(next);
      if (!legalMoves('blue', next).length) return finish('black');
      timers.schedule(() => { setLocked(false); setStatus('Твой ход'); }, 240);
    }, delay);
  };

  const saveMultiplayerMove = async (next: CheckerCell[]) => {
    if (!room) return;
    const nextColor: CheckerColor = myColor === 'blue' ? 'black' : 'blue';
    const winner = legalMoves(nextColor, next).length ? null : myColor;
    setLocked(true);
    const { data, error } = await supabase.rpc('make_checkers_move', { room_id: room.id, next_board: next, next_turn: nextColor, next_winner: winner });
    if (error) {
      setCells([...room.board]);
      setLocked(false);
      notice.show('Ход не прошёл');
      return;
    }
    if (validRoom(data) && userId) syncRoom(data, userId);
  };

  const tap = (index: number) => {
    if (locked || finished) return;
    const moves = legalMoves(myColor, cells, chainPiece, capturedThisTurn);
    if (checkerColor(cells[index]) === myColor && moves.some((move) => move.from === index)) {
      setSelected(index);
      telegram.selectionChanged();
      return;
    }
    const move = selected === null ? null : moves.find((candidate) => candidate.from === selected && candidate.to === index);
    if (!move) return;
    const nextCaptured = move.capture === null ? capturedThisTurn : [...capturedThisTurn, move.capture];
    const nextStep = applyCheckerMove(cells, move, false);
    setStarted(true);
    telegram.impact(move.capture === null ? 'light' : 'medium');
    const follow = move.capture === null ? [] : pieceMoves(move.to, true, nextStep, nextCaptured);
    if (follow.length) {
      setCells(nextStep);
      setSelected(move.to);
      setChainPiece(move.to);
      setCapturedThisTurn(nextCaptured);
      return;
    }
    const next = completeCheckerTurn(nextStep, nextCaptured);
    setCells(next);
    setSelected(null);
    setChainPiece(null);
    setCapturedThisTurn([]);
    if (room) void saveMultiplayerMove(next);
    else timers.schedule(() => runBotMove(next, null, 450), 120);
  };

  const restart = async () => {
    telegram.impact('light');
    if (room) {
      const { data, error } = await supabase.rpc('restart_checkers_room', { room_id: room.id });
      if (error) return notice.show('Не удалось начать новую игру');
      if (validRoom(data) && userId) syncRoom(data, userId);
      return;
    }
    timers.clearAll();
    setCells(initialCheckersBoard());
    setSelected(null);
    setChainPiece(null);
    setCapturedThisTurn([]);
    setLocked(false);
    setFinished(null);
    setStarted(false);
    setStatus('Твой ход');
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      let activeRoom = room;
      if (!activeRoom) {
        const user: User = await ensureAnonymousUser();
        setUserId(user.id);
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_checkers_room', { player_name: profile?.name ?? 'Игрок' });
        if (error) throw error;
        if (!validRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        window.history.replaceState(null, '', `/games/checkers?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id, user.id);
        syncRoom(data, user.id);
      }
      const outcome = await shareGameInvite({ title: 'Шашки', text: 'Сыграем в шашки?', startParam: `checkers_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось создать приглашение'));
    }
  };

  const screenIndices = Array.from({ length: 64 }, (_, index) => flipped ? 63 - index : index);
  const displayedColumns = flipped ? [...columns].reverse() : [...columns];
  const displayedRows = flipped ? [...rows].reverse() : [...rows];

  return (
    <GameShell
      title="Шашки"
      opponent={opponent}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={locked || (finished !== null && finished !== myColor)}
      gameInset={false}
      game={
        <section className="checkers-sheet" aria-label="Поле шашек">
          <div className="checkers-layout">
            <div className="checkers-columns checkers-columns--top">{displayedColumns.map((label) => <span key={label}>{label}</span>)}</div>
            <div className="checkers-rows checkers-rows--left">{displayedRows.map((label) => <span key={label}>{label}</span>)}</div>
            <div className="checkerboard">
              {screenIndices.map((index, screenIndex) => {
                const piece = cells[index];
                const isAvailable = available.some((move) => move.to === index);
                return <button key={index} type="button" className={classNames('checker-square', selected === index && 'is-selected', isAvailable && 'is-available')} aria-label={`${displayedColumns[screenIndex % 8] ?? ''}${displayedRows[Math.floor(screenIndex / 8)] ?? ''}${piece ? `, ${checkerColor(piece) === 'blue' ? 'синяя' : 'чёрная'} шашка${isKing(piece) ? ', дамка' : ''}` : ''}`} disabled={locked} onClick={() => tap(index)}>{piece && <span className={classNames('checker-piece', `checker-piece--${checkerColor(piece)}`, isKing(piece) && 'is-king')} aria-hidden="true" />}</button>;
              })}
            </div>
            <div className="checkers-rows checkers-rows--right">{displayedRows.map((label) => <span key={label}>{label}</span>)}</div>
            <div className="checkers-columns checkers-columns--bottom">{displayedColumns.map((label) => <span key={label}>{label}</span>)}</div>
          </div>
        </section>
      }
      footer={finished
        ? <GameFooter variant="button" onPlayAgain={restart} />
        : !started && !room
          ? <GameFooter variant="slider" value={difficulty} label={difficultyLabels[difficulty]} onChange={(value) => { if (value !== difficulty) telegram.selectionChanged(); setDifficulty(value); }} />
          : <GameFooter variant="empty" />}
    />
  );
}
