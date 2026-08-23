'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { GameFooter, type GameFooterShip, type GameFooterTab } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { Button } from '../../components/ui/Button';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { classNames } from '../../lib/class-names';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { telegram } from '../../lib/telegram/client';
import { BattleBoard } from './BattleBoard';
import { canPlaceShip, chooseRobotTarget, emptyShots, fireAt, fleetSizes, placementCells, randomFleet, remainingFleet, shipAt, survivingFleet, type FleetCounts, type Ship, type ShipSize, type ShotBoard } from './engine';

type Phase = 'setup' | 'battle' | 'finished';
type Winner = 'player' | 'robot' | null;

const inventorySizes: readonly ShipSize[] = [1, 2, 3, 4];

function footerShips(counts: FleetCounts): GameFooterShip[] {
  return inventorySizes.map((size) => ({ size, count: counts[size] }));
}

function FleetSetup({ ships }: { ships: readonly Ship[] }) {
  const remaining = remainingFleet(ships);
  return (
    <div className="battle-setup">
      <div className="battle-setup__copy">
        <strong>Расставь корабли</strong>
        <span>Выдели клетки на поле,<br />чтобы поставить корабль</span>
      </div>
      <div className="battle-inventory" aria-label="Оставшиеся корабли">
        {inventorySizes.map((size) => (
          <span key={size} className={classNames('battle-inventory__item', remaining[size] === 0 && 'is-empty')}>
            <strong>{remaining[size]} ×</strong>
            <i style={{ width: `${size * 16}px` }} aria-hidden="true" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function SeaBattleGame() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [playerShips, setPlayerShips] = useState<Ship[]>([]);
  const [robotShips, setRobotShips] = useState<Ship[]>([]);
  const [playerShots, setPlayerShots] = useState<ShotBoard>(emptyShots);
  const [robotShots, setRobotShots] = useState<ShotBoard>(emptyShots);
  const [turn, setTurn] = useState<'player' | 'robot'>('player');
  const [field, setField] = useState<GameFooterTab>('opponent');
  const [winner, setWinner] = useState<Winner>(null);
  const [resolvingShot, setResolvingShot] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [draftValid, setDraftValid] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const draftRef = useRef<number[]>([]);
  const nextShipIdRef = useRef(1);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  const setupComplete = playerShips.length === fleetSizes.length;

  const updateDraft = (current: number) => {
    const start = dragStartRef.current;
    if (start === null) return;
    const next = placementCells(start, current, playerShips);
    if (next.length !== draftRef.current.length) telegram.selectionChanged();
    draftRef.current = next;
    setDraft(next);
    setDraftValid(canPlaceShip(playerShips, next));
  };

  const beginPlacement = (cell: number) => {
    const existing = shipAt(playerShips, cell);
    if (existing) {
      setPlayerShips((current) => current.filter((ship) => ship.id !== existing.id));
      telegram.impact('light');
      return;
    }
    dragStartRef.current = cell;
    updateDraft(cell);
  };

  const finishPlacement = () => {
    if (dragStartRef.current === null) return;
    const cells = draftRef.current;
    const valid = canPlaceShip(playerShips, cells);
    if (valid && cells.length) {
      const size = cells.length as ShipSize;
      const ship: Ship = { id: `manual-${nextShipIdRef.current++}`, size, cells };
      setPlayerShips((current) => [...current, ship]);
      telegram.impact('medium');
    } else {
      telegram.notify('warning');
    }
    dragStartRef.current = null;
    draftRef.current = [];
    setDraft([]);
    setDraftValid(false);
  };

  const arrangeRandomly = () => {
    setPlayerShips(randomFleet());
    dragStartRef.current = null;
    draftRef.current = [];
    setDraft([]);
    setDraftValid(false);
    telegram.impact('medium');
  };

  const finishGame = (nextWinner: Exclude<Winner, null>) => {
    setResolvingShot(false);
    setWinner(nextWinner);
    setPhase('finished');
    setField(nextWinner === 'player' ? 'opponent' : 'mine');
    telegram.notify(nextWinner === 'player' ? 'success' : 'error');
  };

  const runRobotTurn = (currentShots: ShotBoard) => {
    timers.schedule(() => {
      const target = chooseRobotTarget(playerShips, currentShots);
      if (target === undefined) return;
      const outcome = fireAt(playerShips, currentShots, target);
      if (!outcome) return;
      setRobotShots(outcome.shots);
      telegram.impact(outcome.hit ? 'medium' : 'light');
      if (outcome.won) return finishGame('robot');
      if (outcome.hit) {
        runRobotTurn(outcome.shots);
      } else {
        timers.schedule(() => {
          setTurn('player');
          setField('opponent');
        }, 420);
      }
    }, 620);
  };

  const fire = (cell: number) => {
    if (phase !== 'battle' || turn !== 'player' || field !== 'opponent' || resolvingShot || playerShots[cell]) return;
    const outcome = fireAt(robotShips, playerShots, cell);
    if (!outcome) return;
    setResolvingShot(true);
    setPlayerShots(outcome.shots);
    telegram.impact(outcome.hit ? 'medium' : 'light');
    if (outcome.won) return finishGame('player');
    if (outcome.hit) return timers.schedule(() => setResolvingShot(false), 280);
    timers.schedule(() => {
      setTurn('robot');
      setField('mine');
      setResolvingShot(false);
      runRobotTurn(robotShots);
    }, 520);
  };

  const startGame = () => {
    if (!setupComplete) return;
    timers.clearAll();
    setRobotShips(randomFleet());
    setPlayerShots(emptyShots());
    setRobotShots(emptyShots());
    setWinner(null);
    setResolvingShot(false);
    setPhase('battle');
    setTurn('player');
    setField('opponent');
    telegram.impact('medium');
  };

  const restart = () => {
    timers.clearAll();
    setPhase('setup');
    setPlayerShips([]);
    setRobotShips([]);
    setPlayerShots(emptyShots());
    setRobotShots(emptyShots());
    setWinner(null);
    setResolvingShot(false);
    setTurn('player');
    setField('opponent');
    telegram.impact('light');
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      const outcome = await shareGameInvite({ title: 'Морской бой', text: 'Сыграем в Морской бой?', startParam: 'sea_battle' });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось поделиться игрой'));
    }
  };

  const status = winner === 'player' ? 'Победа' : winner === 'robot' ? 'Поражение' : turn === 'player' ? 'Твой ход' : 'Ход соперника';
  const showingMine = phase === 'setup' || field === 'mine';
  const displayedShips = showingMine ? playerShips : robotShips;
  const displayedShots = showingMine ? robotShots : playerShots;
  const battleFleet = survivingFleet(displayedShips, displayedShots);

  return (
    <GameShell
      title="Морской бой"
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={turn === 'robot' || winner === 'robot'}
      hero={phase === 'setup' ? <FleetSetup ships={playerShips} /> : undefined}
      gameInset={false}
      game={
        <BattleBoard
          ships={displayedShips}
          shots={displayedShots}
          revealShips={showingMine}
          interactive={phase === 'setup' || (phase === 'battle' && turn === 'player' && field === 'opponent' && !resolvingShot)}
          draftCells={phase === 'setup' ? draft : []}
          draftValid={draftValid}
          showRemoveHints={phase === 'setup'}
          onCellClick={phase === 'battle' && field === 'opponent' ? fire : undefined}
          onDragStart={phase === 'setup' ? beginPlacement : undefined}
          onDragMove={phase === 'setup' ? updateDraft : undefined}
          onDragEnd={phase === 'setup' ? finishPlacement : undefined}
        />
      }
      footer={phase === 'setup'
        ? <GameFooter variant="custom" className="battle-footer">
            <Button className={classNames('battle-footer__random', setupComplete && 'battle-footer__random--icon')} variant={setupComplete ? 'surface' : 'primary'} size={setupComplete ? 'icon' : 'medium'} onClick={arrangeRandomly} aria-label={setupComplete ? 'Случайная расстановка' : undefined}>
              <Image src="/icons/battleship-shuffle.svg" width={20} height={20} alt="" unoptimized />
              {!setupComplete ? <span>Случайная расстановка</span> : null}
            </Button>
            {setupComplete ? <Button className="battle-footer__start" onClick={startGame}>Начать игру</Button> : null}
          </GameFooter>
        : phase === 'finished'
          ? <GameFooter variant="button" onPlayAgain={restart} />
          : <GameFooter variant="ships" label={showingMine ? 'Мои корабли' : 'Корабли соперника'} ships={footerShips(battleFleet)} />}
    />
  );
}
