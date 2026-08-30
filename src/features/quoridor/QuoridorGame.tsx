'use client';

import { useEffect, useRef, useState } from 'react';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';
import { canPlaceWall, distanceToGoal, initialState, legalMoves, type GameState, type Position, type Side, type Wall } from './engine';

type Drag = { row: number; col: number; x: number; y: number };
type PlayerMode = 'move' | 'wall';
type WallDrag = { orientation: Wall['orientation']; wall: Wall | null };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const equal = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

export function QuoridorGame() {
  const [state, setState] = useState<GameState>(initialState);
  const [turn, setTurn] = useState<Side>('blue');
  const [walls, setWalls] = useState({ blue: 10, black: 10 });
  const [thinking, setThinking] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [mode, setMode] = useState<PlayerMode>('move');
  const [preview, setPreview] = useState<Wall | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const wallDragRef = useRef<WallDrag | null>(null);
  const botTurnRef = useRef(0);
  const notice = useNotice();
  const playerMoves = legalMoves(state, 'blue');

  const finish = (side: Side) => {
    setWinner(side);
    telegram.notify(side === 'blue' ? 'success' : 'error');
  };

  const completeTurn = (next: GameState, side: Side) => {
    setState(next);
    if (next[side].row === (side === 'blue' ? 0 : 8)) return finish(side);
    setTurn(side === 'blue' ? 'black' : 'blue');
  };

  useEffect(() => {
    if (turn !== 'black' || winner) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const blueDistance = distanceToGoal(state, 'blue');
      const blackDistance = distanceToGoal(state, 'black');
      const wallOptions = walls.black > 0
        ? Array.from({ length: 128 }, (_, index) => ({
          orientation: index < 64 ? 'horizontal' as const : 'vertical' as const,
          row: Math.floor((index % 64) / 8),
          col: index % 8,
        }))
          .filter((wall) => canPlaceWall(state, wall))
          .map((wall) => {
            const next = { ...state, walls: [...state.walls, { ...wall, side: 'black' as const }] };
            const nextBlueDistance = distanceToGoal(next, 'blue');
            const nextBlackDistance = distanceToGoal(next, 'black');
            const distanceFromBlue = Math.abs(wall.row - state.blue.row) + Math.abs(wall.col - state.blue.col);
            return {
              wall,
              next,
              blueGain: nextBlueDistance - blueDistance,
              score: (nextBlueDistance - blueDistance) * 100 - Math.max(0, nextBlackDistance - blackDistance) * 30 - distanceFromBlue,
            };
          })
          .sort((a, b) => {
            return b.score - a.score;
          })
        : [];
      const usefulWalls = wallOptions.filter((option) => option.blueGain > 0);
      const bestWall = usefulWalls.length
        ? usefulWalls[botTurnRef.current++ % Math.min(usefulWalls.length, 4)]
        : null;

      if (bestWall && blueDistance <= blackDistance + 1) {
        setWalls((current) => ({ ...current, black: current.black - 1 }));
        completeTurn(bestWall.next, 'black');
        setThinking(false);
        return;
      }

      const moves = legalMoves(state, 'black');
      const choice = [...moves].sort((a, b) => {
        const afterA = { ...state, black: a };
        const afterB = { ...state, black: b };
        return distanceToGoal(afterA, 'black') - distanceToGoal(afterB, 'black');
      })[0];
      if (choice) completeTurn({ ...state, black: choice }, 'black');
      setThinking(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state, turn, walls.black, winner]);

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
    return orientation === 'vertical'
      ? { orientation, row: clamp(drag.row, 0, 7), col: clamp(dx < 0 ? drag.col - 1 : drag.col, 0, 7) }
      : { orientation, row: clamp(dy < 0 ? drag.row - 1 : drag.row, 0, 7), col: clamp(drag.col, 0, 7) };
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
    return orientation === 'horizontal'
      ? { orientation, row: clamp(Math.round(y * 9) - 1, 0, 7), col: clamp(Math.floor(x * 9), 0, 7) }
      : { orientation, row: clamp(Math.floor(y * 9), 0, 7), col: clamp(Math.round(x * 9) - 1, 0, 7) };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (turn !== 'blue' || thinking || winner) return;
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
    const wall = previewWall(drag, point);
    setPreview(wall);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = pointFor(event);
    dragRef.current = null;
    setPreview(null);
    if (!drag || !point || turn !== 'blue' || thinking || winner) return;
    const wall = previewWall(drag, point);
    if (mode === 'wall') {
      if (!wall) return;
      if (!walls.blue || !canPlaceWall(state, wall)) return telegram.notify('warning');
      telegram.impact('medium');
      setWalls((current) => ({ ...current, blue: current.blue - 1 }));
      completeTurn({ ...state, walls: [...state.walls, { ...wall, side: 'blue' }] }, 'blue');
      return;
    }
    const target = { row: point.row, col: point.col };
    if (!playerMoves.some((move) => equal(move, target))) return;
    telegram.impact('light');
    completeTurn({ ...state, blue: target }, 'blue');
  };

  const beginWallDrag = (orientation: Wall['orientation'], event: React.PointerEvent<HTMLButtonElement>) => {
    if (locked || walls.blue === 0) return;
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
    setWalls((current) => ({ ...current, blue: current.blue - 1 }));
    completeTurn({ ...state, walls: [...state.walls, { ...drag.wall, side: 'blue' }] }, 'blue');
  };

  const restart = () => {
    botTurnRef.current = 0;
    setState(initialState()); setTurn('blue'); setWalls({ blue: 10, black: 10 }); setWinner(null); setThinking(false); setMode('move'); setPreview(null);
  };

  const invite = async () => {
    try {
      const outcome = await shareGameInvite({ title: 'Коридор', text: 'Сыграем в Коридор?', startParam: 'quoridor' });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) { notice.show(errorMessage(error, 'Не удалось поделиться игрой')); }
  };

  const status = winner ? (winner === 'blue' ? 'Победа' : 'Поражение') : thinking ? 'Ход соперника' : 'Твой ход';
  const wallIsValid = preview ? canPlaceWall(state, preview) && walls.blue > 0 : true;
  const locked = turn !== 'blue' || thinking || Boolean(winner);
  const boardLocked = locked;

  return <GameShell
    title="Коридор"
    onInvite={invite}
    notice={notice.message}
    status={status}
    statusMuted={thinking || winner === 'black'}
    game={<div className={`quoridor-board quoridor-board--${mode}`} ref={boardRef} data-game-input onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; setPreview(null); }}>
      {Array.from({ length: 81 }, (_, index) => {
        const position = { row: Math.floor(index / 9), col: index % 9 };
        const player = equal(position, state.blue) ? 'blue' : equal(position, state.black) ? 'black' : null;
        const available = mode === 'move' && !boardLocked && playerMoves.some((move) => equal(move, position));
        return <span key={index} className={`quoridor-cell${available ? ' is-available' : ''}`}>{player ? <i className={`quoridor-piece quoridor-piece--${player}`} /> : null}</span>;
      })}
      {state.walls.map((wall, index) => <i key={`${wall.orientation}-${wall.row}-${wall.col}-${index}`} className={`quoridor-wall quoridor-wall--${wall.orientation} quoridor-wall--${wall.side ?? 'black'}`} style={wallStyle(wall)} />)}
      {preview ? <i className={`quoridor-wall quoridor-wall--${preview.orientation} is-preview${wallIsValid ? '' : ' is-invalid'}`} style={wallStyle(preview)} /> : null}
    </div>}
    footer={winner ? <GameFooter variant="button" onPlayAgain={restart} /> : <GameFooter variant="custom" className="quoridor-footer">
      <div className="quoridor-wall-choices" aria-label="Выбор стены">
        <button type="button" className="quoridor-wall-choice quoridor-wall-choice--horizontal" aria-label="Горизонтальная стена" disabled={locked || walls.blue === 0} onPointerDown={(event) => beginWallDrag('horizontal', event)} onPointerMove={moveWallDrag} onPointerUp={endWallDrag} onPointerCancel={endWallDrag}><i /></button>
        <button type="button" className="quoridor-wall-choice quoridor-wall-choice--vertical" aria-label="Вертикальная стена" disabled={locked || walls.blue === 0} onPointerDown={(event) => beginWallDrag('vertical', event)} onPointerMove={moveWallDrag} onPointerUp={endWallDrag} onPointerCancel={endWallDrag}><i /></button>
      </div>
    </GameFooter>}
  />;
}
