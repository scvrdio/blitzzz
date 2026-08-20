-- Run once in Supabase → SQL Editor.
-- Aligns new online rooms with the local starting position: all pieces occupy
-- the same colour of squares, so the first move is always legal.

alter table public.checkers_rooms alter column board set default
  '[null,"black",null,"black",null,"black",null,"black","black",null,"black",null,"black",null,"black",null,null,"black",null,"black",null,"black",null,"black",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"blue",null,"blue",null,"blue",null,"blue",null,null,"blue",null,"blue",null,"blue",null,"blue","blue",null,"blue",null,"blue",null,"blue",null]'::jsonb;

create or replace function public.restart_checkers_room(room_id uuid)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.checkers_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if auth.uid() <> result.blue_player and auth.uid() <> result.black_player then raise exception 'You are not a player in this room'; end if;
  update public.checkers_rooms set
    board = '[null,"black",null,"black",null,"black",null,"black","black",null,"black",null,"black",null,"black",null,null,"black",null,"black",null,"black",null,"black",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"blue",null,"blue",null,"blue",null,"blue",null,null,"blue",null,"blue",null,"blue",null,"blue","blue",null,"blue",null,"blue",null,"blue",null]'::jsonb,
    turn = 'blue', winner = null, status = case when result.black_player is null then 'waiting' else 'active' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

-- Existing waiting rooms have not started yet, so it is safe to correct them.
update public.checkers_rooms set board =
  '[null,"black",null,"black",null,"black",null,"black","black",null,"black",null,"black",null,"black",null,null,"black",null,"black",null,"black",null,"black",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"blue",null,"blue",null,"blue",null,"blue",null,null,"blue",null,"blue",null,"blue",null,"blue","blue",null,"blue",null,"blue",null,"blue",null]'::jsonb
where status = 'waiting';
