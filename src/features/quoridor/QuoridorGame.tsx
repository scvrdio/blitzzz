'use client';

import { useEffect, useRef, useState } from 'react';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { useNotice } from '../../hooks/use-notice';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';
import { canPlaceWall, distanceToGoal, initialState, legalMoves, type GameState, type Position, type Side, type Wall } from './engine';

type Drag = { row: number; col: number; x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const equal = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

export function QuoridorGame() {
  const [state, setState] = useState<GameState>(initialState);
  const [turn, setTurn] = useState<Side>('blue');
  const [walls, setWalls] = useState({ blue: 10, black: 10 });
  const [thinking, setThinking] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [preview, setPreview] = useState<Wall | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
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
    if (turn !== 'black' || thinking || winner) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
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
  }, [state, thinking, turn, winner]);

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (turn !== 'blue' || thinking || winner) return;
    const point = pointFor(event);
    if (!point) return;
    dragRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (wall) {
      if (!walls.blue || !canPlaceWall(state, wall)) return telegram.notify('warning');
      telegram.impact('medium');
      setWalls((current) => ({ ...current, blue: current.blue - 1 }));
      completeTurn({ ...state, walls: [...state.walls, wall] }, 'blue');
      return;
    }
    const target = { row: point.row, col: point.col };
    if (!playerMoves.some((move) => equal(move, target))) return;
    telegram.impact('light');
    completeTurn({ ...state, blue: target }, 'blue');
  };

  const restart = () => {
    setState(initialState()); setTurn('blue'); setWalls({ blue: 10, black: 10 }); setWinner(null); setThinking(false); setPreview(null);
  };

  const invite = async () => {
    try {
      const outcome = await shareGameInvite({ title: 'Коридор', text: 'Сыграем в Коридор?', startParam: 'quoridor' });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) { notice.show(errorMessage(error, 'Не удалось поделиться игрой')); }
  };

  const status = winner ? (winner === 'blue' ? 'Победа' : 'Поражение') : thinking ? 'Ход соперника' : 'Твой ход';
  const wallIsValid = preview ? canPlaceWall(state, preview) && walls.blue > 0 : true;

  return <GameShell
    title="Коридор"
    onInvite={invite}
    notice={notice.message}
    status={status}
    statusMuted={thinking || winner === 'black'}
    game={<div className="quoridor-board" ref={boardRef} data-game-input onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; setPreview(null); }}>
      {Array.from({ length: 81 }, (_, index) => {
        const position = { row: Math.floor(index / 9), col: index % 9 };
        const player = equal(position, state.blue) ? 'blue' : equal(position, state.black) ? 'black' : null;
        const available = turn === 'blue' && !thinking && !winner && playerMoves.some((move) => equal(move, position));
        return <span key={index} className={`quoridor-cell${available ? ' is-available' : ''}`}>{player ? <i className={`quoridor-piece quoridor-piece--${player}`} /> : null}</span>;
      })}
      {state.walls.map((wall, index) => <i key={`${wall.orientation}-${wall.row}-${wall.col}-${index}`} className={`quoridor-wall quoridor-wall--${wall.orientation}`} style={wall.orientation === 'horizontal' ? { gridRow: wall.row + 1, gridColumn: `${wall.col + 1} / span 2` } : { gridRow: `${wall.row + 1} / span 2`, gridColumn: wall.col + 1 }} />)}
      {preview ? <i className={`quoridor-wall quoridor-wall--${preview.orientation} is-preview${wallIsValid ? '' : ' is-invalid'}`} style={preview.orientation === 'horizontal' ? { gridRow: preview.row + 1, gridColumn: `${preview.col + 1} / span 2` } : { gridRow: `${preview.row + 1} / span 2`, gridColumn: preview.col + 1 }} /> : null}
    </div>}
    footer={winner ? <GameFooter variant="button" onPlayAgain={restart} /> : <GameFooter variant="custom" className="quoridor-footer"><span>Твои стены: {walls.blue}</span><span>Стены соперника: {walls.black}</span></GameFooter>}
  />;
}
