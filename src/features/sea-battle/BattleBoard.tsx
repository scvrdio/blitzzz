'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import { isShipSunk, seaBattleSize, shipAt, type Ship, type ShotBoard } from './engine';

const columns = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

export type BattleGridProps = {
  ships: readonly Ship[];
  shots: Readonly<ShotBoard>;
  revealShips: boolean;
  interactive?: boolean;
  draftCells?: readonly number[];
  draftValid?: boolean;
  showRemoveHints?: boolean;
  onCellClick?: (cell: number) => void;
  onDragStart?: (cell: number) => void;
  onDragMove?: (cell: number) => void;
  onDragEnd?: () => void;
};

function cellPosition(cell: number): CSSProperties {
  const cellRow = Math.floor(cell / seaBattleSize);
  const cellColumn = cell % seaBattleSize;
  return {
    top: `calc(${cellRow * 10 + 5}% + ${cellRow * 0.1 - 0.45}px)`,
    left: `calc(${cellColumn * 10 + 5}% + ${cellColumn * 0.1 - 0.45}px)`,
  };
}

function shipPosition(cells: readonly number[]): { style: CSSProperties; horizontal: boolean } {
  const rows = cells.map((cell) => Math.floor(cell / seaBattleSize));
  const cellColumns = cells.map((cell) => cell % seaBattleSize);
  const horizontal = new Set(rows).size === 1;
  const startRow = Math.min(...rows);
  const startColumn = Math.min(...cellColumns);
  const cellSize = 'calc(10% - 0.9px)';
  const shipSize = `calc(${cells.length * 10}% - ${1 - cells.length * 0.1}px)`;
  return {
    horizontal,
    style: {
      top: `calc(${startRow * 10}% + ${startRow * 0.1}px)`,
      left: `calc(${startColumn * 10}% + ${startColumn * 0.1}px)`,
      width: horizontal ? shipSize : cellSize,
      height: horizontal ? cellSize : shipSize,
    },
  };
}

export function BattleGrid({ ships, shots, revealShips, interactive = false, draftCells = [], draftValid = false, showRemoveHints = false, onCellClick, onDragStart, onDragMove, onDragEnd }: BattleGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const sunkRef = useRef<Set<string> | null>(null);
  const [sunkTick, setSunkTick] = useState(0);

  useEffect(() => {
    const sunk = new Set(ships.filter((ship) => isShipSunk(ship, shots)).map((ship) => ship.id));
    const animationFrame = sunkRef.current && [...sunk].some((id) => !sunkRef.current?.has(id))
      ? window.requestAnimationFrame(() => setSunkTick((tick) => tick + 1))
      : null;
    sunkRef.current = sunk;
    return () => { if (animationFrame !== null) window.cancelAnimationFrame(animationFrame); };
  }, [ships, shots]);

  const cellFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const column = Math.max(0, Math.min(9, Math.floor((event.clientX - rect.left) / (rect.width / seaBattleSize))));
    const row = Math.max(0, Math.min(9, Math.floor((event.clientY - rect.top) / (rect.height / seaBattleSize))));
    return row * seaBattleSize + column;
  };

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!onDragMove) return;
    const cell = cellFromPointer(event);
    if (cell !== null) onDragMove(cell);
  };

  const startPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!onDragStart) return;
    const cell = cellFromPointer(event);
    if (cell === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragStart(cell);
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd?.();
  };

  return (
    <div
      className={classNames('battle-board__grid', sunkTick > 0 && `is-sunk-${sunkTick % 2}`)}
      ref={gridRef}
      onPointerDown={startPointer}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {Array.from({ length: seaBattleSize * seaBattleSize }, (_, cell) => (
        <button
          key={cell}
          type="button"
          className="battle-board__cell"
          aria-label={`${columns[cell % 10]}${Math.floor(cell / 10) + 1}`}
          disabled={!interactive}
          onClick={onCellClick ? () => onCellClick(cell) : undefined}
        />
      ))}

      {ships.map((ship) => {
        const sunk = isShipSunk(ship, shots);
        if (!revealShips && !sunk) return null;
        const position = shipPosition(ship.cells);
        return <span key={ship.id} className={classNames('battle-board__ship', position.horizontal ? 'is-horizontal' : 'is-vertical', sunk && 'is-sunk')} style={position.style} aria-hidden="true" />;
      })}

      {draftCells.length ? (() => {
        const position = shipPosition(draftCells);
        return <span className={classNames('battle-board__ship', 'is-draft', position.horizontal ? 'is-horizontal' : 'is-vertical', !draftValid && 'is-invalid')} style={position.style} aria-hidden="true" />;
      })() : null}

      {shots.map((shot, cell) => {
        if (!shot) return null;
        if (shot === 'miss') return <span key={cell} className="battle-board__miss" style={cellPosition(cell)} aria-hidden="true" />;
        const ship = shipAt(ships, cell);
        const sunk = ship ? isShipSunk(ship, shots) : false;
        return <span key={cell} className={classNames('battle-board__hit', sunk && 'is-sunk', revealShips && !sunk && 'is-on-ship')} style={cellPosition(cell)} aria-hidden="true" />;
      })}

      {showRemoveHints ? ships.map((ship) => (
        <span key={`remove-${ship.id}`} className="battle-board__remove-hint" style={cellPosition(Math.max(...ship.cells))} aria-hidden="true" />
      )) : null}
    </div>
  );
}

export function BattleBoardFrame({ children }: { children: ReactNode }) {
  return (
    <section className="battle-board" aria-label="Поле морского боя">
      <div className="battle-board__columns battle-board__columns--top" aria-hidden="true">{columns.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="battle-board__rows battle-board__rows--left" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
      {children}
      <div className="battle-board__rows battle-board__rows--right" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
      <div className="battle-board__columns battle-board__columns--bottom" aria-hidden="true">{columns.map((label) => <span key={label}>{label}</span>)}</div>
    </section>
  );
}

export function BattleBoard(props: BattleGridProps) {
  return <BattleBoardFrame><BattleGrid {...props} /></BattleBoardFrame>;
}
