'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { GameFooter } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { Button } from '../../components/ui/Button';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';
import { useNotice } from '../../hooks/use-notice';

type Side = 'blue' | 'black';
type Piece = { id: string; side: Side; x: number; y: number; vx: number; vy: number; eliminatedAt?: number };
type Geometry = { width: number; height: number; boardTop: number; boardSize: number; radius: number };
type Drag = { pieceId: string; x: number; y: number };

const sides: Side[] = ['blue', 'black'];
const opponentOf = (side: Side): Side => side === 'blue' ? 'black' : 'blue';
const emptyGeometry: Geometry = { width: 0, height: 0, boardTop: 56, boardSize: 0, radius: 0 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const displayPointFor = (geometry: Geometry, flipped: boolean, x: number, y: number) =>
  flipped ? { x: geometry.boardSize - x, y: geometry.boardTop + geometry.boardSize - (y - geometry.boardTop) } : { x, y };
const rotatePoint = (geometry: Geometry, turns: number, x: number, y: number) => {
  const centerX = geometry.boardSize / 2;
  const centerY = geometry.boardTop + geometry.boardSize / 2;
  let nextX = x - centerX;
  let nextY = y - centerY;
  for (let index = 0; index < turns; index += 1) [nextX, nextY] = [-nextY, nextX];
  return { x: centerX + nextX, y: centerY + nextY };
};

function setUpPieces(geometry: Geometry, ranks: Record<Side, number>) {
  if (!geometry.boardSize) return [];
  const cell = geometry.boardSize / 8;
  return sides.flatMap((side) => Array.from({ length: 8 }, (_, index): Piece => ({
    id: `${side}-${index}`,
    side,
    x: cell * (index + .5),
    y: geometry.boardTop + cell * (ranks[side] + .5),
    vx: 0,
    vy: 0,
  })));
}

export function ChapaevGame({ playerSide = 'blue' }: { playerSide?: Side }) {
  const [started, setStarted] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [geometry, setGeometry] = useState<Geometry>(emptyGeometry);
  const [turn, setTurn] = useState<Side>('blue');
  const [moving, setMoving] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [boardRotation, setBoardRotation] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const geometryRef = useRef<Geometry>(emptyGeometry);
  const ranksRef = useRef<Record<Side, number>>({ blue: 7, black: 0 });
  const turnRef = useRef<Side>('blue');
  const dragRef = useRef<Drag | null>(null);
  const movingRef = useRef(false);
  const winnerRef = useRef<Side | null>(null);
  const shotCountsRef = useRef<Record<Side, number> | null>(null);
  const strikerIdRef = useRef<string | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const roundTimerRef = useRef<number | null>(null);
  const rotationTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const notice = useNotice();
  const botSide = opponentOf(playerSide);
  const flipped = playerSide === 'black';
  const rotationTurns = ((boardRotation % 4) + 4) % 4;

  const setPieceState = (next: Piece[]) => {
    piecesRef.current = next;
    setPieces(next.map((piece) => ({ ...piece })));
  };

  const setTurnState = (next: Side) => {
    turnRef.current = next;
    setTurn(next);
  };

  const setMovingState = (next: boolean) => {
    movingRef.current = next;
    setMoving(next);
  };

  const resetRound = (nextRanks = ranksRef.current, nextTurn: Side = 'blue') => {
    ranksRef.current = nextRanks;
    setPieceState(setUpPieces(geometryRef.current, nextRanks));
    setTurnState(nextTurn);
    setMovingState(false);
    shotCountsRef.current = null;
  };

  useEffect(() => {
    const arena = arenaRef.current;
    if (!arena) return;
    const updateGeometry = () => {
      const rect = arena.getBoundingClientRect();
      const boardSize = Math.min(rect.width, Math.max(0, rect.height - 104));
      const next = { width: rect.width, height: rect.height, boardTop: 56, boardSize, radius: boardSize / 20 };
      geometryRef.current = next;
      setGeometry(next);
      if (!started) setPieceState(setUpPieces(next, ranksRef.current));
    };
    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(arena);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    const tick = (time: number) => {
      const previousTime = lastFrameRef.current || time;
      const dt = Math.min((time - previousTime) / 1000, .032);
      lastFrameRef.current = time;
      const world = geometryRef.current;
      let next = piecesRef.current.map((piece) => ({ ...piece }));
      let changed = false;
      const now = Date.now();

      for (const piece of next) {
        if (piece.eliminatedAt && now - piece.eliminatedAt >= 2000) {
          changed = true;
          continue;
        }
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        const damping = Math.pow(.035, dt);
        piece.vx *= damping;
        piece.vy *= damping;
        if (Math.abs(piece.vx) < 5) piece.vx = 0;
        if (Math.abs(piece.vy) < 5) piece.vy = 0;
        const leftBoard = piece.x < 0 || piece.x > world.boardSize || piece.y < world.boardTop || piece.y > world.boardTop + world.boardSize;
        if (leftBoard && !piece.eliminatedAt) {
          piece.eliminatedAt = now;
          changed = true;
        }
      }
      next = next.filter((piece) => !piece.eliminatedAt || now - piece.eliminatedAt < 5000);

      for (let i = 0; i < next.length; i += 1) {
        const first = next[i];
        if (first.eliminatedAt) continue;
        for (let j = i + 1; j < next.length; j += 1) {
          const second = next[j];
          if (second.eliminatedAt) continue;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy) || .001;
          const minDistance = world.radius * 2;
          if (distance >= minDistance) continue;
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = minDistance - distance;
          first.x -= nx * overlap / 2;
          first.y -= ny * overlap / 2;
          second.x += nx * overlap / 2;
          second.y += ny * overlap / 2;
          const relativeSpeed = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
          if (relativeSpeed < 0) {
            const impulse = -relativeSpeed * .92;
            first.vx -= impulse * nx;
            first.vy -= impulse * ny;
            second.vx += impulse * nx;
            second.vy += impulse * ny;
            telegram.impact(Math.abs(relativeSpeed) > 480 ? 'heavy' : Math.abs(relativeSpeed) > 180 ? 'medium' : 'light');
          }
          changed = true;
        }
      }

      const anyInMotion = next.some((piece) => Math.hypot(piece.vx, piece.vy) > 10);
      if (started && movingRef.current && !anyInMotion) {
        const before = shotCountsRef.current;
        const active = (side: Side) => next.filter((piece) => piece.side === side && !piece.eliminatedAt).length;
        const current = turnRef.current;
        const enemy = opponentOf(current);
        const enemyRemoved = Boolean(before && active(enemy) < before[enemy]);
        const strikerStayedOnBoard = Boolean(strikerIdRef.current && next.some((piece) => piece.id === strikerIdRef.current && !piece.eliminatedAt));
        setMovingState(false);
        shotCountsRef.current = null;
        strikerIdRef.current = null;
        if (active(enemy) === 0 || active(current) === 0) {
          if (active(enemy) === 0 && active(current) === 0) {
            telegram.notify('warning');
            roundTimerRef.current = window.setTimeout(() => {
              setPieceState(setUpPieces(geometryRef.current, ranksRef.current));
              setTurnState('blue');
              setMovingState(false);
            }, 750);
          } else {
            const roundWinner = active(enemy) === 0 ? current : enemy;
            const roundLoser = opponentOf(roundWinner);
            const nextRanks = { ...ranksRef.current };
            const rowsAreAdjacent = Math.abs(nextRanks.blue - nextRanks.black) === 1;
            if (rowsAreAdjacent) nextRanks[roundLoser] += roundLoser === 'blue' ? 1 : -1;
            else nextRanks[roundWinner] += roundWinner === 'blue' ? -1 : 1;
            const reachedFinish = rowsAreAdjacent && (nextRanks[roundLoser] < 0 || nextRanks[roundLoser] > 7);
            if (reachedFinish) {
              winnerRef.current = roundWinner;
              setWinner(roundWinner);
              setTurnState(roundWinner);
              telegram.notify(roundWinner === playerSide ? 'success' : 'error');
            } else {
              telegram.notify('success');
              roundTimerRef.current = window.setTimeout(() => {
                ranksRef.current = nextRanks;
                setPieceState(setUpPieces(geometryRef.current, nextRanks));
                setTurnState(roundWinner);
                setMovingState(false);
              }, 750);
            }
          }
        } else {
          setTurnState(enemyRemoved && strikerStayedOnBoard ? current : enemy);
        }
        changed = true;
      }

      if (changed || movingRef.current) setPieceState(next);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current); };
  }, [playerSide, started]);

  const displayPoint = (x: number, y: number) => {
    const world = geometryRef.current;
    const base = displayPointFor(world, flipped, x, y);
    return rotatePoint(world, rotationTurns, base.x, base.y);
  };

  const worldPoint = (x: number, y: number) => {
    const world = geometryRef.current;
    const base = rotatePoint(world, (4 - rotationTurns) % 4, x, y);
    return flipped ? { x: world.boardSize - base.x, y: world.boardTop + world.boardSize - (base.y - world.boardTop) } : base;
  };

  const inputPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = arenaRef.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
  };

  const launch = (pieceId: string, pointer: { x: number; y: number }) => {
    if (movingRef.current || winnerRef.current) return;
    const worldPointer = worldPoint(pointer.x, pointer.y);
    const piece = piecesRef.current.find((candidate) => candidate.id === pieceId && !candidate.eliminatedAt);
    if (!piece) return;
    const dx = piece.x - worldPointer.x;
    const dy = piece.y - worldPointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 18) return;
    const power = clamp(distance, 0, 220);
    const scale = (power / distance) * 11;
    piece.vx = dx * scale;
    piece.vy = dy * scale;
    shotCountsRef.current = {
      blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
      black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
    };
    strikerIdRef.current = pieceId;
    setMovingState(true);
    telegram.impact(power > 140 ? 'heavy' : 'medium');
  };

  const start = () => {
    winnerRef.current = null;
    setWinner(null);
    ranksRef.current = { blue: 7, black: 0 };
    resetRound(ranksRef.current, 'blue');
    setStarted(true);
    telegram.impact('medium');
  };

  useEffect(() => {
    if (!started || moving || winner || turn !== botSide) return;
    botTimerRef.current = window.setTimeout(() => {
      const candidates = piecesRef.current.filter((piece) => piece.side === botSide && !piece.eliminatedAt);
      const targets = piecesRef.current.filter((piece) => piece.side === playerSide && !piece.eliminatedAt);
      const piece = candidates[Math.floor(Math.random() * candidates.length)];
      const target = targets.sort((a, b) => Math.hypot(a.x - piece.x, a.y - piece.y) - Math.hypot(b.x - piece.x, b.y - piece.y))[0];
      if (!piece || !target) return;
      const dx = target.x - piece.x;
      const dy = target.y - piece.y;
      const distance = Math.hypot(dx, dy) || 1;
      piece.vx = dx / distance * (620 + Math.random() * 340);
      piece.vy = dy / distance * (620 + Math.random() * 340);
      shotCountsRef.current = {
        blue: piecesRef.current.filter((candidate) => candidate.side === 'blue' && !candidate.eliminatedAt).length,
        black: piecesRef.current.filter((candidate) => candidate.side === 'black' && !candidate.eliminatedAt).length,
      };
      strikerIdRef.current = piece.id;
      setMovingState(true);
      telegram.impact('medium');
    }, 850);
    return () => { if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current); };
  }, [botSide, moving, playerSide, started, turn, winner]);

  useEffect(() => () => {
    if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    if (roundTimerRef.current !== null) window.clearTimeout(roundTimerRef.current);
    if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!started || moving || winner || turn !== playerSide) return;
    const point = inputPoint(event);
    if (!point) return;
    const candidate = piecesRef.current.find((piece) => {
      if (piece.side !== playerSide || piece.eliminatedAt) return false;
      const display = displayPoint(piece.x, piece.y);
      return Math.hypot(display.x - point.x, display.y - point.y) <= geometryRef.current.radius * 1.2;
    });
    if (!candidate) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { pieceId: candidate.id, ...point };
    dragRef.current = next;
    setDrag(next);
    telegram.selectionChanged();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    const point = inputPoint(event);
    if (!point) return;
    const next = { pieceId: dragRef.current.pieceId, ...point };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) event.preventDefault();
    const activeDrag = dragRef.current;
    const point = inputPoint(event);
    if (activeDrag && point) launch(activeDrag.pieceId, point);
    dragRef.current = null;
    setDrag(null);
  };

  const guide = useMemo(() => {
    if (!drag) return null;
    const piece = pieces.find((candidate) => candidate.id === drag.pieceId);
    if (!piece) return null;
    const startPoint = displayPointFor(geometry, flipped, piece.x, piece.y);
    const pointer = rotatePoint(geometry, (4 - rotationTurns) % 4, drag.x, drag.y);
    const dx = pointer.x - startPoint.x;
    const dy = pointer.y - startPoint.y;
    const length = Math.min(Math.hypot(dx, dy), 150);
    const ratio = length / (Math.hypot(dx, dy) || 1);
    return { x: startPoint.x, y: startPoint.y, angle: Math.atan2(dy, dx) * 180 / Math.PI, length, endX: startPoint.x + dx * ratio, endY: startPoint.y + dy * ratio };
  }, [drag, flipped, geometry, pieces, rotationTurns]);

  const status = winner ? (winner === playerSide ? 'Победа' : 'Поражение') : !started ? (playerSide === 'blue' ? 'Твой ход' : 'Ход соперника') : turn === playerSide ? 'Твой ход' : 'Ход соперника';
  const statusMuted = winner ? winner === 'black' : !started ? playerSide === 'black' : turn === 'black';

  const invite = async () => {
    try {
      telegram.impact('light');
      const outcome = await shareGameInvite({ title: 'Чапаева', text: 'Сыграем в Чапаева?', startParam: 'chapayev' });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось поделиться игрой'));
    }
  };

  return (
    <GameShell
      title="Чапаева"
      opponent={{ name: 'Соперник Робот' }}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={statusMuted}
      game={
        <div
          ref={arenaRef}
          className="chapaev-arena"
          aria-label="Поле игры Чапаева"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="chapaev-rotating-layer" style={{ transform: `rotate(${boardRotation * 90}deg) scale(${isRotating ? .75 : 1})`, transformOrigin: `${geometry.boardSize / 2}px ${geometry.boardTop + geometry.boardSize / 2}px` }}>
            <div className="chapaev-board" style={{ top: geometry.boardTop, width: geometry.boardSize, height: geometry.boardSize }} />
            {guide ? <><span className="chapaev-guide" style={{ left: guide.x, top: guide.y, width: guide.length, transform: `rotate(${guide.angle}deg)` }} /><span className="chapaev-guide__handle" style={{ left: guide.endX, top: guide.endY }} /></> : null}
            {pieces.map((piece) => {
              const point = displayPointFor(geometry, flipped, piece.x, piece.y);
              return <span key={piece.id} className={`chapaev-piece chapaev-piece--${piece.side}${piece.eliminatedAt ? ' is-eliminated' : ''}`} style={{ left: point.x, top: point.y, width: geometry.radius * 2, height: geometry.radius * 2 }} aria-hidden="true" />;
            })}
          </div>
        </div>
      }
      footer={winner
        ? <GameFooter variant="button" onPlayAgain={start} />
        : !started
          ? <GameFooter variant="button" label="Начать игру" onPlayAgain={start} />
          : <GameFooter variant="custom" className="chapaev-footer">
              <Button
                className="chapaev-footer__rotate"
                variant="surface"
                disabled={moving}
                onClick={() => {
                  if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
                  setBoardRotation((current) => current + 1);
                  setIsRotating(true);
                  rotationTimerRef.current = window.setTimeout(() => setIsRotating(false), 180);
                  telegram.impact('light');
                }}
              >
                <Image src="/icons/rotate-board-icon.svg" width={20} height={20} alt="" unoptimized />
                <span>Повернуть поле</span>
              </Button>
            </GameFooter>}
    />
  );
}
