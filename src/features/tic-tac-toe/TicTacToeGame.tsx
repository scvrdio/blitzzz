'use client';

import { useEffect, useMemo, useState } from 'react';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';

type Mark = 'x' | 'o';
type Cell = Mark | null;
type Result = Mark | 'draw' | null;

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

export function TicTacToeGame() {
  const [cells, setCells] = useState<Cell[]>(() => Array<Cell>(9).fill(null));
  const [robotThinking, setRobotThinking] = useState(false);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  useEffect(() => { preloadGameSounds(['/sounds/tic-tac-toe-tap.wav']); }, []);
  const result = useMemo(() => resultFor(cells), [cells]);
  const winningLine = useMemo<readonly number[]>(() => winner(cells) ?? [], [cells]);
  const status = result === 'x' ? 'Победа' : result === 'o' ? 'Поражение' : result === 'draw' ? 'Ничья' : robotThinking ? 'Ход соперника' : 'Твой ход';

  const finishFeedback = (nextResult: Result) => {
    if (nextResult) telegram.notify(nextResult === 'x' ? 'success' : nextResult === 'o' ? 'error' : 'warning');
  };

  const move = (index: number) => {
    if (robotThinking || result || cells[index]) return;
    telegram.impact('light');
    const next = [...cells];
    next[index] = 'x';
    const nextResult = resultFor(next);
    setCells(next);
    playGameSound('/sounds/tic-tac-toe-tap.wav', .25);
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

  const restart = () => {
    telegram.impact('light');
    timers.clearAll();
    setCells(Array<Cell>(9).fill(null));
    setRobotThinking(false);
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      const outcome = await shareGameInvite({ title: 'Крестики-нолики', text: 'Сыграем в крестики-нолики?', startParam: 'tic_tac_toe' });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось поделиться игрой'));
    }
  };

  return (
    <GameShell
      title="Крестики-нолики"
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={robotThinking || result === 'o'}
      game={
        <div className="tic-board" aria-label="Поле крестиков-ноликов">
          {cells.map((cell, index) => (
            <button key={index} type="button" className={`tic-cell${cell ? ` tic-cell--${cell}` : ''}${winningLine.includes(index) ? ' is-winning' : ''}`} aria-label={cell ? `Ячейка ${index + 1}: ${cell === 'x' ? 'крестик' : 'нолик'}` : `Ячейка ${index + 1}`} disabled={robotThinking || Boolean(result) || Boolean(cell)} onClick={() => move(index)}>
              {cell ? <TicMark mark={cell} /> : null}
            </button>
          ))}
        </div>
      }
      footer={result ? <GameFooter variant="button" onPlayAgain={restart} /> : <GameFooter variant="empty" />}
    />
  );
}
