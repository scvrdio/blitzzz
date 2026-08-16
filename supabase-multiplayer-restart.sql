-- Run after the earlier multiplayer SQL scripts.
-- Lets either player restart the current room after the game finishes.

create or replace function public.restart_connect_four_room(room_id uuid)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.connect_four_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if auth.uid() <> result.blue_player and auth.uid() <> result.black_player then raise exception 'You are not a player in this room'; end if;
  update public.connect_four_rooms
  set board = '[ [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null] ]'::jsonb,
      turn = 'blue',
      winner = null,
      status = 'active',
      updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.restart_connect_four_room(uuid) to anon, authenticated;
