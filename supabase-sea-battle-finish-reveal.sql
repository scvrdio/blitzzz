-- Run once in Supabase → SQL Editor for existing Sea Battle multiplayer tables.
-- It reveals the other player's fleet only after the room is finished.

drop function if exists public.get_finished_sea_battle_opponent_fleet(uuid);
create function public.get_finished_sea_battle_opponent_fleet(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result public.sea_battle_rooms;
declare opponent_id uuid;
declare opponent_fleet jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into result from public.sea_battle_rooms where id = p_room_id;
  if not found or result.status <> 'finished' then raise exception 'Fleet is not available'; end if;
  if auth.uid() <> result.host_player and auth.uid() <> result.guest_player then raise exception 'Not a room player'; end if;
  opponent_id := case when auth.uid() = result.host_player then result.guest_player else result.host_player end;
  select ships into opponent_fleet from public.sea_battle_fleets where room_id = p_room_id and player_id = opponent_id;
  return opponent_fleet;
end;
$$;

revoke all on function public.get_finished_sea_battle_opponent_fleet(uuid) from public;
grant execute on function public.get_finished_sea_battle_opponent_fleet(uuid) to authenticated;
