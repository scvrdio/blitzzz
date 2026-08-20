'use client';

import { useMemo, useState } from 'react';
import { GameShell } from '../../components/game/GameShell';
import { GameStatus } from '../../components/game/GameStatus';
import { RestartButton } from '../../components/game/RestartButton';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';

type Mark = 'x' | 'o';
type Cell = Mark | null;
type Result = Mark | 'draw' | null;

const winningLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const;

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
  const result = useMemo(() => resultFor(cells), [cells]);
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
    if (nextResult) return finishFeedback(nextResult);
    setRobotThinking(true);
    timers.schedule(() => {
      setCells((current) => {
        const robotIndex = robotChoice(current);
        if (robotIndex === undefined) return current;
        const afterRobot = [...current];
        afterRobot[robotIndex] = 'o';
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
    <GameShell title="Крестики-нолики" onInvite={invite} notice={notice.message}>
      <section className="game-content">
        <GameStatus muted={robotThinking || result === 'o'}>{status}</GameStatus>
        <div className="tic-board" aria-label="Поле крестиков-ноликов">
          {cells.map((cell, index) => (
            <button key={index} type="button" className={`tic-cell${cell ? ` tic-cell--${cell}` : ''}`} aria-label={cell ? `Ячейка ${index + 1}: ${cell === 'x' ? 'крестик' : 'нолик'}` : `Ячейка ${index + 1}`} disabled={robotThinking || Boolean(result) || Boolean(cell)} onClick={() => move(index)}>
              {cell && <span aria-hidden="true">{cell === 'x' ? '×' : ''}</span>}
            </button>
          ))}
        </div>
        {result && <RestartButton onClick={restart} />}
      </section>
    </GameShell>
  );
}
