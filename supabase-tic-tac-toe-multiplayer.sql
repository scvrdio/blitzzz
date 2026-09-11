-- Run once in Supabase -> SQL Editor. Anonymous authentication must be enabled.

create table if not exists public.tic_tac_toe_rooms (
  id uuid primary key default gen_random_uuid(),
  x_player uuid not null references auth.users(id),
  o_player uuid references auth.users(id),
  x_name text not null default 'Игрок',
  o_name text,
  x_avatar text,
  o_avatar text,
  board jsonb not null default '[null,null,null,null,null,null,null,null,null]'::jsonb,
  turn text not null default 'x' check (turn in ('x', 'o')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  winner text check (winner in ('x', 'o', 'draw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tic_tac_toe_rooms enable row level security;
drop policy if exists "Players can read their tic tac toe room" on public.tic_tac_toe_rooms;
create policy "Players can read their tic tac toe room" on public.tic_tac_toe_rooms
  for select to authenticated using (auth.uid() = x_player or auth.uid() = o_player);

create or replace function public.tic_tac_toe_result(next_board jsonb)
returns text language sql immutable as $$
  select case
    when next_board ->> 0 is not null and next_board ->> 0 = next_board ->> 1 and next_board ->> 1 = next_board ->> 2 then next_board ->> 0
    when next_board ->> 3 is not null and next_board ->> 3 = next_board ->> 4 and next_board ->> 4 = next_board ->> 5 then next_board ->> 3
    when next_board ->> 6 is not null and next_board ->> 6 = next_board ->> 7 and next_board ->> 7 = next_board ->> 8 then next_board ->> 6
    when next_board ->> 0 is not null and next_board ->> 0 = next_board ->> 3 and next_board ->> 3 = next_board ->> 6 then next_board ->> 0
    when next_board ->> 1 is not null and next_board ->> 1 = next_board ->> 4 and next_board ->> 4 = next_board ->> 7 then next_board ->> 1
    when next_board ->> 2 is not null and next_board ->> 2 = next_board ->> 5 and next_board ->> 5 = next_board ->> 8 then next_board ->> 2
    when next_board ->> 0 is not null and next_board ->> 0 = next_board ->> 4 and next_board ->> 4 = next_board ->> 8 then next_board ->> 0
    when next_board ->> 2 is not null and next_board ->> 2 = next_board ->> 4 and next_board ->> 4 = next_board ->> 6 then next_board ->> 2
    when not exists (select 1 from jsonb_array_elements(next_board) cell where cell = 'null'::jsonb) then 'draw'
    else null
  end;
$$;

create or replace function public.create_tic_tac_toe_room(player_name text, player_avatar text default null)
returns public.tic_tac_toe_rooms language plpgsql security definer set search_path = public as $$
declare result public.tic_tac_toe_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.tic_tac_toe_rooms (x_player, x_name, x_avatar)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), ''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.join_tic_tac_toe_room(room_id uuid, player_name text, player_avatar text default null)
returns public.tic_tac_toe_rooms language plpgsql security definer set search_path = public as $$
declare result public.tic_tac_toe_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.tic_tac_toe_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.x_player = auth.uid() or result.o_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.o_player is not null then raise exception 'Room is already full'; end if;
  update public.tic_tac_toe_rooms
  set o_player = auth.uid(), o_name = coalesce(nullif(trim(player_name), ''), 'Игрок'),
      o_avatar = nullif(trim(player_avatar), ''), status = 'active', updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.make_tic_tac_toe_move(room_id uuid, selected_cell integer)
returns public.tic_tac_toe_rooms language plpgsql security definer set search_path = public as $$
declare
  result public.tic_tac_toe_rooms;
  side text;
  next_board jsonb;
  next_result text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if selected_cell < 0 or selected_cell > 8 then raise exception 'Invalid cell'; end if;
  select * into result from public.tic_tac_toe_rooms where id = room_id for update;
  if not found or result.status <> 'active' then raise exception 'Game is unavailable'; end if;
  side := case when result.x_player = auth.uid() then 'x' when result.o_player = auth.uid() then 'o' else null end;
  if side is null or side <> result.turn then raise exception 'It is not your turn'; end if;
  if result.board -> selected_cell <> 'null'::jsonb then raise exception 'Cell is occupied'; end if;
  next_board := jsonb_set(result.board, array[selected_cell::text], to_jsonb(side), false);
  next_result := public.tic_tac_toe_result(next_board);
  update public.tic_tac_toe_rooms
  set board = next_board,
      turn = case when side = 'x' then 'o' else 'x' end,
      winner = next_result,
      status = case when next_result is null then 'active' else 'finished' end,
      updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.restart_tic_tac_toe_room(room_id uuid)
returns public.tic_tac_toe_rooms language plpgsql security definer set search_path = public as $$
declare result public.tic_tac_toe_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.tic_tac_toe_rooms where id = room_id for update;
  if not found or (auth.uid() <> result.x_player and auth.uid() <> result.o_player) then raise exception 'Room is unavailable'; end if;
  update public.tic_tac_toe_rooms
  set board = '[null,null,null,null,null,null,null,null,null]'::jsonb, turn = 'x', winner = null,
      status = case when result.o_player is null then 'waiting' else 'active' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_tic_tac_toe_room(text, text) to anon, authenticated;
grant execute on function public.join_tic_tac_toe_room(uuid, text, text) to anon, authenticated;
grant execute on function public.make_tic_tac_toe_move(uuid, integer) to anon, authenticated;
grant execute on function public.restart_tic_tac_toe_room(uuid) to anon, authenticated;

alter table public.tic_tac_toe_rooms replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tic_tac_toe_rooms') then
    alter publication supabase_realtime add table public.tic_tac_toe_rooms;
  end if;
end $$;
