'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';

type Mark = 'x' | 'o';
type Cell = Mark | null;
type Result = Mark | 'draw' | null;
type TicTacToeRoom = {
  id: string;
  x_player: string;
  o_player: string | null;
  x_name: string | null;
  o_name: string | null;
  x_avatar: string | null;
  o_avatar: string | null;
  board: Cell[];
  turn: Mark;
  status: 'waiting' | 'active' | 'finished';
  winner: Result;
  updated_at?: string;
};

const winningLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const;

function TicMark({ mark }: { mark: Mark }) {
  if (mark === 'x') {
    return (
      <svg className="tic-mark tic-mark--x" viewBox="0 0 53.6562 53.6562" aria-hidden="true">
        <path d="M53.6562 5.65625L35.3128 23.9997C33.7507 25.5618 33.7507 28.0945 35.3128 29.6566L53.6562 48L48 53.6562L29.6566 35.3128C28.0945 33.7507 25.5618 33.7507 23.9997 35.3128L5.65625 53.6562L0 48L18.3434 29.6566C19.9055 28.0945 19.9055 25.5618 18.3434 23.9997L0 5.65625L5.65625 0L23.9997 18.3434C25.5618 19.9055 28.0945 19.9055 29.6566 18.3434L48 0L53.6562 5.65625Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className="tic-mark tic-mark--o" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="8" />
    </svg>
  );
}

function winner(cells: readonly Cell[]) {
  return winningLines.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) ?? null;
}

function resultFor(cells: readonly Cell[]): Result {
  const line = winner(cells);
  if (line) return cells[line[0]];
  return cells.every(Boolean) ? 'draw' : null;
}

function robotChoice(cells: readonly Cell[]) {
  const empty = cells.flatMap((cell, index) => cell ? [] : [index]);
  const winningMove = (mark: Mark) => empty.find((index) => {
    const next = [...cells];
    next[index] = mark;
    return winner(next);
  });
  return winningMove('o') ?? winningMove('x') ?? (cells[4] ? undefined : 4) ?? empty[Math.floor(Math.random() * empty.length)];
}

function validRoom(value: unknown): value is TicTacToeRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<TicTacToeRoom>;
  return typeof room.id === 'string'
    && Array.isArray(room.board)
    && room.board.length === 9
    && room.board.every((cell) => cell === null || cell === 'x' || cell === 'o')
    && (room.turn === 'x' || room.turn === 'o')
    && (room.status === 'waiting' || room.status === 'active' || room.status === 'finished');
}

export function TicTacToeGame({ initialRoomId }: { initialRoomId?: string }) {
  const [cells, setCells] = useState<Cell[]>(() => Array<Cell>(9).fill(null));
  const [robotThinking, setRobotThinking] = useState(false);
  const [room, setRoom] = useState<TicTacToeRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const roomRef = useRef<TicTacToeRoom | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  useEffect(() => { preloadGameSounds(['/sounds/tic-tac-toe-tap.wav']); }, []);
  const myMark: Mark = room?.o_player === userId ? 'o' : 'x';
  const opponent = useMemo(() => {
    if (!room) return { name: 'Соперник Робот' };
    if (room.status === 'waiting') return { name: 'Ждём соперника' };
    return myMark === 'x'
      ? { name: room.o_name || 'Игрок', avatar: room.o_avatar || undefined, multiplayer: true }
      : { name: room.x_name || 'Игрок', avatar: room.x_avatar || undefined, multiplayer: true };
  }, [myMark, room]);
  const result = useMemo(() => resultFor(cells), [cells]);
  const winningLine = useMemo<readonly number[]>(() => winner(cells) ?? [], [cells]);
  const waiting = room?.status === 'waiting';
  const isMyTurn = room ? room.status === 'active' && room.turn === myMark : !robotThinking;
  const locked = Boolean(result || waiting || robotThinking || (room && !isMyTurn));
  const status = waiting ? '' : result === myMark ? 'Победа' : result && result !== 'draw' ? 'Поражение' : result === 'draw' ? 'Ничья' : isMyTurn ? 'Твой ход' : 'Ход соперника';
  const statusMark = result && result !== 'draw' ? result : room?.turn ?? (robotThinking ? 'o' : 'x');

  const finishFeedback = (nextResult: Result) => {
    if (nextResult) telegram.notify(nextResult === 'draw' ? 'warning' : nextResult === myMark ? 'success' : 'error');
  };

  const applyRoom = (next: TicTacToeRoom, currentUserId: string) => {
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
    roomRef.current = next;
    setRoom(next);
    setCells([...next.board]);
    setRobotThinking(false);
    if (previous?.status !== 'finished' && next.status === 'finished') {
      const mark: Mark = next.o_player === currentUserId ? 'o' : 'x';
      if (next.winner) telegram.notify(next.winner === 'draw' ? 'warning' : next.winner === mark ? 'success' : 'error');
    }
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`tic-tac-toe-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tic_tac_toe_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validRoom(next)) applyRoom(next, currentUserId);
      })
      .subscribe();
  };

  const connectRoom = async (id: string) => {
    const user: User = await ensureAnonymousUser();
    setUserId(user.id);
    const profile = telegramProfile();
    const { data, error } = await supabase.rpc('join_tic_tac_toe_room', {
      room_id: id,
      player_name: profile?.name ?? 'Игрок',
      player_avatar: profile?.photoUrl ?? null,
    });
    if (error) throw error;
    if (!validRoom(data)) throw new Error('Сервер вернул некорректное состояние игры');
    subscribe(id, user.id);
    applyRoom(data, user.id);
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

  const move = async (index: number) => {
    if (locked || cells[index]) return;
    telegram.impact('light');
    const next = [...cells];
    next[index] = myMark;
    const nextResult = resultFor(next);
    setCells(next);
    playGameSound('/sounds/tic-tac-toe-tap.wav', .25);
    if (room) {
      setRobotThinking(true);
      const { data, error } = await supabase.rpc('make_tic_tac_toe_move', { room_id: room.id, selected_cell: index });
      if (error || !validRoom(data)) {
        setCells([...room.board]);
        setRobotThinking(false);
        notice.show(errorMessage(error, 'Ход не прошёл'));
        return;
      }
      applyRoom(data, userId ?? '');
      return;
    }
    if (nextResult) return finishFeedback(nextResult);
    setRobotThinking(true);
    timers.schedule(() => {
      setCells((current) => {
        const robotIndex = robotChoice(current);
        if (robotIndex === undefined) return current;
        const afterRobot = [...current];
        afterRobot[robotIndex] = 'o';
        playGameSound('/sounds/tic-tac-toe-tap.wav', .25);
        finishFeedback(resultFor(afterRobot));
        return afterRobot;
      });
      setRobotThinking(false);
    }, 420);
  };

  const restart = async () => {
    telegram.impact('light');
    if (room) {
      const { data, error } = await supabase.rpc('restart_tic_tac_toe_room', { room_id: room.id });
      if (error || !validRoom(data)) return notice.show(errorMessage(error, 'Не удалось начать новую игру'));
      applyRoom(data, userId ?? '');
      return;
    }
    timers.clearAll();
    setCells(Array<Cell>(9).fill(null));
    setRobotThinking(false);
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      let activeRoom = room;
      if (!activeRoom) {
        const user = await ensureAnonymousUser();
        setUserId(user.id);
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_tic_tac_toe_room', { player_name: profile?.name ?? 'Игрок', player_avatar: profile?.photoUrl ?? null });
        if (error) throw error;
        if (!validRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        window.history.replaceState(null, '', `/games/tic-tac-toe?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id, user.id);
        applyRoom(data, user.id);
      }
      const outcome = await shareGameInvite({ title: 'Крестики-нолики', text: 'Сыграем в крестики-нолики?', startParam: `tic_tac_toe_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось поделиться игрой'));
    }
  };

  return (
    <GameShell
      title="Крестики-нолики"
      opponent={opponent}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={statusMark === 'o' || result === 'draw'}
      game={
        <div className="tic-board" aria-label="Поле крестиков-ноликов">
          {cells.map((cell, index) => (
            <button key={index} type="button" className={`tic-cell${cell ? ` tic-cell--${cell}` : ''}${winningLine.includes(index) ? ' is-winning' : ''}`} aria-label={cell ? `Ячейка ${index + 1}: ${cell === 'x' ? 'крестик' : 'нолик'}` : `Ячейка ${index + 1}`} disabled={locked || Boolean(cell)} onClick={() => void move(index)}>
              {cell ? <TicMark mark={cell} /> : null}
            </button>
          ))}
        </div>
      }
      footer={result ? <GameFooter variant="button" onPlayAgain={() => void restart()} /> : <GameFooter variant="empty" />}
    />
  );
}
