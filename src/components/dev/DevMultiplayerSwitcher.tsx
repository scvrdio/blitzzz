'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ensureAnonymousUser,
  getDevSupabaseClient,
  setDevMultiplayerRole,
  supabase,
  type DevMultiplayerRole,
} from '../../lib/supabase/client';

type RoomConfig = {
  table: string;
  hostColumn: string;
  guestColumn: string;
  createRpc: string;
  createArgs: Record<string, string | null>;
};

const enabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEV_MULTIPLAYER === 'true';

function configForPath(pathname: string): RoomConfig | null {
  if (pathname === '/games/four-in-a-row') return { table: 'connect_four_rooms', hostColumn: 'blue_player', guestColumn: 'black_player', createRpc: 'create_connect_four_room', createArgs: { player_name: 'Игрок', player_avatar: null } };
  if (pathname === '/games/checkers') return { table: 'checkers_rooms', hostColumn: 'blue_player', guestColumn: 'black_player', createRpc: 'create_checkers_room', createArgs: { player_name: 'Игрок', player_avatar: null } };
  if (pathname === '/games/chapayev') return { table: 'chapayev_rooms', hostColumn: 'blue_player', guestColumn: 'black_player', createRpc: 'create_chapayev_room', createArgs: { player_name: 'Игрок', player_avatar: null } };
  if (pathname === '/games/sea-battle') return { table: 'sea_battle_rooms', hostColumn: 'host_player', guestColumn: 'guest_player', createRpc: 'create_sea_battle_room', createArgs: { p_player_name: 'Игрок', p_player_avatar: null } };
  return null;
}

function currentRoomId() {
  return new URLSearchParams(window.location.search).get('room');
}

async function readActualRole(config: RoomConfig, roomId: string, userId: string): Promise<DevMultiplayerRole | null> {
  const { data, error } = await supabase
    .from(config.table)
    .select(`${config.hostColumn},${config.guestColumn}`)
    .eq('id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  const room = data as unknown as Record<string, string | null>;
  if (room[config.hostColumn] === userId) return 'host';
  if (room[config.guestColumn] === userId) return 'guest';
  return null;
}

export function DevMultiplayerSwitcher() {
  const [activeRole, setActiveRole] = useState<DevMultiplayerRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const inSupportedRoom = mounted && Boolean(configForPath(window.location.pathname) && currentRoomId());

  useEffect(() => {
    if (!enabled) return;
    const roomId = currentRoomId();
    const config = configForPath(window.location.pathname);
    if (!roomId || !config) return;

    let cancelled = false;
    const syncRole = async (showFailure: boolean) => {
      const user = await ensureAnonymousUser();
      const actualRole = await readActualRole(config, roomId, user.id);
      if (cancelled) return;
      setActiveRole(actualRole);
      if (actualRole) setMessage(null);
      else if (showFailure) setMessage('Текущая локальная сессия не входит в эту комнату. Создайте новую тест-комнату.');
    };

    void syncRole(false).catch((error) => console.error('[dev-multiplayer]', error));
    // The game joins the room in its own effect. Check again after that RPC.
    const retry = window.setTimeout(() => {
      void syncRole(true).catch((error) => {
        console.error('[dev-multiplayer]', error);
        if (!cancelled) setMessage('Не удалось проверить роль в комнате');
      });
    }, 900);
    return () => { cancelled = true; window.clearTimeout(retry); };
  }, []);

  const switchRole = async (target: DevMultiplayerRole) => {
    if (busy || target === activeRole) return;
    setBusy(true);
    setMessage(null);
    try {
      const targetClient = getDevSupabaseClient(target);
      await ensureAnonymousUser(targetClient);
      setDevMultiplayerRole(target);
      window.location.reload();
    } catch (error) {
      console.error('[dev-multiplayer]', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось переключить игрока');
      setBusy(false);
    }
  };

  const createTestRoom = async () => {
    const config = configForPath(window.location.pathname);
    if (busy || !config) return;
    setBusy(true);
    setMessage(null);
    try {
      const hostClient = getDevSupabaseClient('host');
      await ensureAnonymousUser(hostClient);
      const { data, error } = await hostClient.rpc(config.createRpc, config.createArgs);
      if (error || !data || typeof (data as { id?: unknown }).id !== 'string') {
        throw error || new Error('Не удалось создать тестовую комнату');
      }
      setDevMultiplayerRole('host');
      const roomId = (data as { id: string }).id;
      window.location.assign(`${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
    } catch (error) {
      console.error('[dev-multiplayer]', error);
      setMessage(error instanceof Error ? error.message : 'Не удалось создать тестовую комнату');
      setBusy(false);
    }
  };

  if (!enabled || !inSupportedRoom) return null;
  return <div className="dev-multiplayer-wrap">
    <div className="dev-multiplayer" role="group" aria-label="Локальный тест двух игроков">
      <button className={activeRole === 'host' ? 'is-selected' : ''} type="button" disabled={busy} onClick={() => void switchRole('host')}>Я</button>
      <button className={activeRole === 'guest' ? 'is-selected' : ''} type="button" disabled={busy} onClick={() => void switchRole('guest')}>Соперник</button>
    </div>
    <button className="dev-multiplayer__create" type="button" disabled={busy} onClick={() => void createTestRoom()}>Новая тест-комната</button>
    {message ? <span className="dev-multiplayer__error" role="status">{message}</span> : null}
  </div>;
}
