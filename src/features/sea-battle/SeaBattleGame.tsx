'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import Image from 'next/image';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { GameFooter, type GameFooterShip, type GameFooterTab } from '../../components/game/GameFooter';
import { GameShell } from '../../components/game/GameShell';
import { Button } from '../../components/ui/Button';
import { useNotice } from '../../hooks/use-notice';
import { useTimeoutRegistry } from '../../hooks/use-timeout-registry';
import { classNames } from '../../lib/class-names';
import { errorMessage, shareGameInvite } from '../../lib/game-invite';
import { ensureAnonymousUser, supabase } from '../../lib/supabase/client';
import { telegram, telegramProfile } from '../../lib/telegram/client';
import { BattleBoard, BattleBoardFrame, BattleGrid } from './BattleBoard';
import { canPlaceShip, chooseRobotTarget, emptyShots, fireAt, fleetCounts, fleetSizes, placementCells, randomFleet, remainingFleet, shipAt, survivingFleet, type FleetCounts, type Ship, type ShipSize, type ShotBoard } from './engine';
import { opponentSide, readyFor, shotsFor, sideForUser, sunkFor, validFleet, validSeaBattleRoom, type SeaBattleRoom } from './multiplayer';

type Phase = 'setup' | 'battle' | 'finished';
type Winner = 'player' | 'robot' | null;

const inventorySizes: readonly ShipSize[] = [1, 2, 3, 4];
const fieldFlipDelay = 1000;
const robotOpeningDelay = 1500;
const robotFollowUpDelay = 1000;
const robotTurnEndDelay = 1000;

function footerShips(counts: FleetCounts): GameFooterShip[] {
  return inventorySizes.map((size) => ({ size, count: counts[size] }));
}

function fleetAfterSunk(ships: readonly Ship[]): FleetCounts {
  const remaining = { ...fleetCounts };
  ships.forEach((ship) => { remaining[ship.size] = Math.max(0, remaining[ship.size] - 1); });
  return remaining;
}

function FleetSetup({ ships, waiting }: { ships: readonly Ship[]; waiting?: string }) {
  const remaining = remainingFleet(ships);
  return (
    <div className="battle-setup">
      <div className="battle-setup__copy">
        <strong>{waiting ? 'Флот готов' : 'Расставь корабли'}</strong>
        <span>{waiting ?? <>Выдели клетки на поле,<br />чтобы поставить корабль</>}</span>
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

type BattleFieldsProps = {
  field: GameFooterTab;
  playerShips: readonly Ship[];
  opponentShips: readonly Ship[];
  playerShots: ShotBoard;
  opponentShots: ShotBoard;
  interactive: boolean;
  onFire: (cell: number) => void;
};

function BattleFields({ field, playerShips, opponentShips, playerShots, opponentShots, interactive, onFire }: BattleFieldsProps) {
  const showingOpponent = field === 'opponent';
  return (
    <BattleBoardFrame>
      <div className="battle-board-scene">
        <div className={classNames('battle-board-flipper', showingOpponent && 'is-showing-opponent')}>
          <div className="battle-board-face battle-board-face--mine" aria-hidden={showingOpponent}>
            <BattleGrid ships={playerShips} shots={opponentShots} revealShips interactive={false} />
          </div>
          <div className="battle-board-face battle-board-face--opponent" aria-hidden={!showingOpponent}>
            <BattleGrid ships={opponentShips} shots={playerShots} revealShips={false} interactive={interactive && showingOpponent} onCellClick={onFire} />
          </div>
        </div>
      </div>
    </BattleBoardFrame>
  );
}

export function SeaBattleGame({ initialRoomId }: { initialRoomId?: string }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [playerShips, setPlayerShips] = useState<Ship[]>([]);
  const [opponentShips, setOpponentShips] = useState<Ship[]>([]);
  const [playerShots, setPlayerShots] = useState<ShotBoard>(emptyShots);
  const [opponentShots, setOpponentShots] = useState<ShotBoard>(emptyShots);
  const [localTurn, setLocalTurn] = useState<'player' | 'robot'>('player');
  const [field, setField] = useState<GameFooterTab>('opponent');
  const [winner, setWinner] = useState<Winner>(null);
  const [resolvingShot, setResolvingShot] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [draftValid, setDraftValid] = useState(false);
  const [room, setRoom] = useState<SeaBattleRoom | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const draftRef = useRef<number[]>([]);
  const nextShipIdRef = useRef(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<SeaBattleRoom | null>(null);
  const mountedRef = useRef(true);
  const fieldTimerRef = useRef<number | null>(null);
  const notice = useNotice();
  const timers = useTimeoutRegistry();
  const setupComplete = playerShips.length === fleetSizes.length;
  const mySide = room ? sideForUser(room, userId) : null;
  const myReady = Boolean(room && mySide && readyFor(room, mySide));
  const isMyTurn = room && mySide ? room.turn === mySide : localTurn === 'player';

  const opponent = useMemo(() => {
    if (!room || !mySide) return { name: 'Соперник Робот' };
    const isHost = mySide === 'host';
    const opponentId = isHost ? room.guest_player : room.host_player;
    if (!opponentId) return { name: 'Ждём соперника' };
    return {
      name: (isHost ? room.guest_name : room.host_name) || 'Игрок',
      avatar: (isHost ? room.guest_avatar : room.host_avatar) || undefined,
      multiplayer: true,
    };
  }, [mySide, room]);

  const clearFieldTimer = () => {
    if (fieldTimerRef.current !== null) window.clearTimeout(fieldTimerRef.current);
    fieldTimerRef.current = null;
  };

  const showFieldAfterDelay = (nextField: GameFooterTab) => {
    clearFieldTimer();
    setResolvingShot(true);
    fieldTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setField(nextField);
      setResolvingShot(false);
      fieldTimerRef.current = null;
    }, fieldFlipDelay);
  };

  const syncRoom = (next: SeaBattleRoom, currentUserId: string, initial = false) => {
    if (!mountedRef.current) return;
    const previous = roomRef.current;
    if (previous?.updated_at && next.updated_at && Date.parse(next.updated_at) < Date.parse(previous.updated_at)) return;
    const side = sideForUser(next, currentUserId);
    if (!side) return;
    const enemySide = opponentSide(side);
    const nextPhase: Phase = next.status === 'active' ? 'battle' : next.status === 'finished' ? 'finished' : 'setup';

    roomRef.current = next;
    setRoom(next);
    setPlayerShots([...shotsFor(next, side)]);
    setOpponentShots([...shotsFor(next, enemySide)]);
    setOpponentShips(sunkFor(next, enemySide).map((ship) => ({ ...ship, cells: [...ship.cells] })));
    setPhase(nextPhase);
    setWinner(next.winner ? (next.winner === side ? 'player' : 'robot') : null);

    if (previous && (previous.status === 'active' || previous.status === 'finished') && (next.status === 'placing' || next.status === 'waiting')) {
      setPlayerShips([]);
      setDraft([]);
      draftRef.current = [];
    }

    if (initial || previous?.status !== 'active' && next.status === 'active') {
      clearFieldTimer();
      setField(next.turn === side ? 'opponent' : 'mine');
      setResolvingShot(false);
    } else if (next.status === 'active' && previous?.turn !== next.turn) {
      showFieldAfterDelay(next.turn === side ? 'opponent' : 'mine');
    } else if (next.status === 'finished') {
      clearFieldTimer();
      setField(next.winner === side ? 'opponent' : 'mine');
      setResolvingShot(false);
      if (previous?.status !== 'finished') telegram.notify(next.winner === side ? 'success' : 'error');
    }
  };

  const subscribe = (id: string, currentUserId: string) => {
    void channelRef.current?.unsubscribe();
    channelRef.current = supabase
      .channel(`sea-battle-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sea_battle_rooms', filter: `id=eq.${id}` }, ({ new: next }) => {
        if (validSeaBattleRoom(next)) syncRoom(next, currentUserId);
      })
      .subscribe();
  };

  const loadOwnFleet = async (id: string, currentUserId: string) => {
    const { data, error } = await supabase.from('sea_battle_fleets').select('ships').eq('room_id', id).eq('player_id', currentUserId).maybeSingle();
    if (error) throw error;
    if (data && validFleet(data.ships)) setPlayerShips(data.ships.map((ship) => ({ ...ship, cells: [...ship.cells] })));
  };

  const connectRoom = async (id: string) => {
    const user = await ensureAnonymousUser();
    const profile = telegramProfile();
    const { data, error } = await supabase.rpc('join_sea_battle_room', {
      p_room_id: id,
      p_player_name: profile?.name ?? 'Игрок',
      p_player_avatar: profile?.photoUrl ?? null,
    });
    if (error) throw error;
    if (!validSeaBattleRoom(data)) throw new Error('Сервер вернул некорректное состояние игры');
    setUserId(user.id);
    await loadOwnFleet(id, user.id);
    subscribe(id, user.id);
    syncRoom(data, user.id, true);
    return { user, room: data };
  };

  const connectToInitialRoom = useEffectEvent((id: string) => {
    void connectRoom(id).catch((error) => notice.show(errorMessage(error, 'Не удалось открыть сетевую игру')));
  });

  useEffect(() => {
    mountedRef.current = true;
    const connectTimer = initialRoomId ? window.setTimeout(() => connectToInitialRoom(initialRoomId), 0) : null;
    return () => {
      mountedRef.current = false;
      if (connectTimer !== null) window.clearTimeout(connectTimer);
      clearFieldTimer();
      void channelRef.current?.unsubscribe();
    };
  }, [initialRoomId]);

  useEffect(() => {
    if (phase !== 'setup' || myReady) return;
    const elements = [document.documentElement, document.body];
    const previousStyles = elements.map((element) => ({
      element,
      overflowX: element.style.overflowX,
      overflowY: element.style.overflowY,
      overscrollBehavior: element.style.overscrollBehavior,
      touchAction: element.style.touchAction,
    }));
    const preventTouchMove = (event: TouchEvent) => event.preventDefault();

    elements.forEach((element) => {
      element.style.overflowX = 'hidden';
      element.style.overflowY = 'hidden';
      element.style.overscrollBehavior = 'none';
      element.style.touchAction = 'none';
    });
    document.addEventListener('touchmove', preventTouchMove, { passive: false });
    telegram.setVerticalSwipes(true);

    return () => {
      document.removeEventListener('touchmove', preventTouchMove);
      previousStyles.forEach(({ element, overflowX, overflowY, overscrollBehavior, touchAction }) => {
        element.style.overflowX = overflowX;
        element.style.overflowY = overflowY;
        element.style.overscrollBehavior = overscrollBehavior;
        element.style.touchAction = touchAction;
      });
      telegram.setVerticalSwipes(false);
    };
  }, [myReady, phase]);

  const updateDraft = (current: number) => {
    const start = dragStartRef.current;
    if (start === null || myReady) return;
    const next = placementCells(start, current, playerShips);
    if (next.length !== draftRef.current.length) telegram.selectionChanged();
    draftRef.current = next;
    setDraft(next);
    setDraftValid(canPlaceShip(playerShips, next));
  };

  const beginPlacement = (cell: number) => {
    if (myReady) return;
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
    if (dragStartRef.current === null || myReady) return;
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
    if (myReady) return;
    setPlayerShips(randomFleet());
    dragStartRef.current = null;
    draftRef.current = [];
    setDraft([]);
    setDraftValid(false);
    telegram.impact('medium');
  };

  const finishLocalGame = (nextWinner: Exclude<Winner, null>) => {
    setResolvingShot(false);
    setWinner(nextWinner);
    setPhase('finished');
    setField(nextWinner === 'player' ? 'opponent' : 'mine');
    telegram.notify(nextWinner === 'player' ? 'success' : 'error');
  };

  const runRobotTurn = (currentShots: ShotBoard, delay = robotOpeningDelay) => {
    timers.schedule(() => {
      const target = chooseRobotTarget(playerShips, currentShots);
      if (target === undefined) return;
      const outcome = fireAt(playerShips, currentShots, target);
      if (!outcome) return;
      setOpponentShots(outcome.shots);
      telegram.impact(outcome.hit ? 'medium' : 'light');
      if (outcome.won) return finishLocalGame('robot');
      if (outcome.hit) {
        runRobotTurn(outcome.shots, robotFollowUpDelay);
      } else {
        timers.schedule(() => { setLocalTurn('player'); setField('opponent'); }, robotTurnEndDelay);
      }
    }, delay);
  };

  const fire = async (cell: number) => {
    if (phase !== 'battle' || !isMyTurn || field !== 'opponent' || resolvingShot || playerShots[cell]) return;
    if (room && mySide) {
      setResolvingShot(true);
      const { data, error } = await supabase.rpc('fire_sea_battle', { p_room_id: room.id, p_target: cell });
      if (error || !validSeaBattleRoom(data)) {
        setResolvingShot(false);
        notice.show(error ? errorMessage(error, 'Ход не прошёл') : 'Сервер вернул некорректное состояние игры');
        return;
      }
      const hit = shotsFor(data, mySide)[cell] === 'hit';
      telegram.impact(hit ? 'medium' : 'light');
      syncRoom(data, userId!, false);
      if (data.status === 'active' && data.turn === mySide) timers.schedule(() => setResolvingShot(false), 280);
      return;
    }

    const outcome = fireAt(opponentShips, playerShots, cell);
    if (!outcome) return;
    setResolvingShot(true);
    setPlayerShots(outcome.shots);
    telegram.impact(outcome.hit ? 'medium' : 'light');
    if (outcome.won) return finishLocalGame('player');
    if (outcome.hit) return timers.schedule(() => setResolvingShot(false), 280);
    timers.schedule(() => {
      setLocalTurn('robot');
      setField('mine');
      setResolvingShot(false);
      runRobotTurn(opponentShots);
    }, fieldFlipDelay);
  };

  const startGame = async () => {
    if (!setupComplete) return;
    timers.clearAll();
    if (room && mySide) {
      const { data, error } = await supabase.rpc('set_sea_battle_fleet', { p_room_id: room.id, p_fleet: playerShips });
      if (error || !validSeaBattleRoom(data)) {
        if (error) console.error('[sea-battle] Failed to save fleet', JSON.stringify(error));
        notice.show(error ? errorMessage(error, 'Не удалось сохранить расстановку') : 'Сервер вернул некорректное состояние игры');
        return;
      }
      telegram.impact('medium');
      syncRoom(data, userId!, data.status === 'active');
      return;
    }
    setOpponentShips(randomFleet());
    setPlayerShots(emptyShots());
    setOpponentShots(emptyShots());
    setWinner(null);
    setResolvingShot(false);
    setPhase('battle');
    setLocalTurn('player');
    setField('opponent');
    telegram.impact('medium');
  };

  const restart = async () => {
    telegram.impact('light');
    timers.clearAll();
    clearFieldTimer();
    if (room) {
      const { data, error } = await supabase.rpc('restart_sea_battle_room', { p_room_id: room.id });
      if (error || !validSeaBattleRoom(data)) return notice.show('Не удалось начать новую игру');
      setPlayerShips([]);
      syncRoom(data, userId!, true);
      return;
    }
    setPhase('setup');
    setPlayerShips([]);
    setOpponentShips([]);
    setPlayerShots(emptyShots());
    setOpponentShots(emptyShots());
    setWinner(null);
    setResolvingShot(false);
    setLocalTurn('player');
    setField('opponent');
  };

  const invite = async () => {
    telegram.impact('light');
    try {
      let activeRoom = room;
      if (!activeRoom) {
        const user: User = await ensureAnonymousUser();
        const profile = telegramProfile();
        const { data, error } = await supabase.rpc('create_sea_battle_room', {
          p_player_name: profile?.name ?? 'Игрок',
          p_player_avatar: profile?.photoUrl ?? null,
        });
        if (error) throw error;
        if (!validSeaBattleRoom(data)) throw new Error('Сервер вернул некорректную игровую сессию');
        activeRoom = data;
        setUserId(user.id);
        timers.clearAll();
        setPhase('setup');
        setOpponentShips([]);
        setPlayerShots(emptyShots());
        setOpponentShots(emptyShots());
        setWinner(null);
        window.history.replaceState(null, '', `/games/sea-battle?room=${encodeURIComponent(data.id)}`);
        subscribe(data.id, user.id);
        syncRoom(data, user.id, true);
      }
      const outcome = await shareGameInvite({ title: 'Морской бой', text: 'Сыграем в Морской бой?', startParam: `sea_battle_${activeRoom.id}` });
      if (outcome === 'copied') notice.show('Ссылка-приглашение скопирована');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notice.show(errorMessage(error, 'Не удалось создать приглашение'));
    }
  };

  const status = winner === 'player' ? 'Победа' : winner === 'robot' ? 'Поражение' : isMyTurn ? 'Твой ход' : 'Ход соперника';
  const showingMine = phase === 'setup' || field === 'mine';
  const displayedShots = showingMine ? opponentShots : playerShots;
  const battleFleet = showingMine ? survivingFleet(playerShips, displayedShots) : room ? fleetAfterSunk(opponentShips) : survivingFleet(opponentShips, displayedShots);
  const waitingCopy = myReady ? (room?.guest_player ? 'Соперник расставляет корабли' : 'Ждём соперника') : undefined;

  return (
    <GameShell
      title="Морской бой"
      opponent={opponent}
      onInvite={invite}
      notice={notice.message}
      status={status}
      statusMuted={!isMyTurn || winner === 'robot'}
      hero={phase === 'setup' ? <FleetSetup ships={playerShips} waiting={waitingCopy} /> : undefined}
      gameInset={false}
      game={phase === 'setup'
        ? <BattleBoard
            ships={playerShips}
            shots={opponentShots}
            revealShips
            interactive={!myReady}
            draftCells={draft}
            draftValid={draftValid}
            showRemoveHints={!myReady}
            onDragStart={beginPlacement}
            onDragMove={updateDraft}
            onDragEnd={finishPlacement}
          />
        : <BattleFields
            field={field}
            playerShips={playerShips}
            opponentShips={opponentShips}
            playerShots={playerShots}
            opponentShots={opponentShots}
            interactive={phase === 'battle' && isMyTurn && !resolvingShot}
            onFire={(cell) => void fire(cell)}
          />}
      footer={phase === 'setup'
        ? myReady
          ? <GameFooter variant="empty" />
          : <GameFooter variant="custom" className="battle-footer">
              <Button className={classNames('battle-footer__random', setupComplete && 'battle-footer__random--icon')} variant={setupComplete ? 'surface' : 'primary'} size={setupComplete ? 'icon' : 'medium'} onClick={arrangeRandomly} aria-label={setupComplete ? 'Случайная расстановка' : undefined}>
                <Image src="/icons/battleship-shuffle.svg" width={20} height={20} alt="" unoptimized />
                {!setupComplete ? <span>Случайная расстановка</span> : null}
              </Button>
              {setupComplete ? <Button className="battle-footer__start" onClick={() => void startGame()}>Готово</Button> : null}
            </GameFooter>
        : phase === 'finished'
          ? <GameFooter variant="button" onPlayAgain={() => void restart()} />
          : <GameFooter variant="ships" label={showingMine ? 'Мои корабли' : 'Корабли соперника'} ships={footerShips(battleFleet)} />}
    />
  );
}
