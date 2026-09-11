-- Run once in Supabase -> SQL Editor. Anonymous authentication must be enabled.

create table if not exists public.quoridor_rooms (
  id uuid primary key default gen_random_uuid(),
  blue_player uuid not null references auth.users(id),
  black_player uuid references auth.users(id),
  blue_name text not null default 'Игрок',
  black_name text,
  blue_avatar text,
  black_avatar text,
  state jsonb not null default '{"blue":{"row":8,"col":4},"black":{"row":0,"col":4},"walls":[]}'::jsonb,
  blue_walls integer not null default 10 check (blue_walls between 0 and 10),
  black_walls integer not null default 10 check (black_walls between 0 and 10),
  turn text not null default 'blue' check (turn in ('blue', 'black')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  winner text check (winner in ('blue', 'black')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quoridor_rooms enable row level security;
drop policy if exists "Players can read their quoridor room" on public.quoridor_rooms;
create policy "Players can read their quoridor room" on public.quoridor_rooms
  for select to authenticated using (auth.uid() = blue_player or auth.uid() = black_player);

create or replace function public.create_quoridor_room(player_name text, player_avatar text default null)
returns public.quoridor_rooms language plpgsql security definer set search_path = public as $$
declare result public.quoridor_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.quoridor_rooms (blue_player, blue_name, blue_avatar)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), ''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.join_quoridor_room(room_id uuid, player_name text, player_avatar text default null)
returns public.quoridor_rooms language plpgsql security definer set search_path = public as $$
declare result public.quoridor_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.quoridor_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.quoridor_rooms
  set black_player = auth.uid(), black_name = coalesce(nullif(trim(player_name), ''), 'Игрок'),
      black_avatar = nullif(trim(player_avatar), ''), status = 'active', updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.make_quoridor_move(room_id uuid, next_state jsonb, next_blue_walls integer, next_black_walls integer, next_winner text default null)
returns public.quoridor_rooms language plpgsql security definer set search_path = public as $$
declare
  result public.quoridor_rooms;
  side text;
  other_side text;
  old_wall_count integer;
  new_wall_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if jsonb_typeof(next_state) <> 'object' or jsonb_typeof(next_state -> 'blue') <> 'object'
    or jsonb_typeof(next_state -> 'black') <> 'object' or jsonb_typeof(next_state -> 'walls') <> 'array'
    or next_blue_walls not between 0 and 10 or next_black_walls not between 0 and 10
    or (next_winner is not null and next_winner not in ('blue', 'black')) then
    raise exception 'Invalid game state';
  end if;
  select * into result from public.quoridor_rooms where id = room_id for update;
  if not found or result.status <> 'active' then raise exception 'Game is unavailable'; end if;
  side := case when result.blue_player = auth.uid() then 'blue' when result.black_player = auth.uid() then 'black' else null end;
  if side is null or side <> result.turn then raise exception 'It is not your turn'; end if;
  other_side := case when side = 'blue' then 'black' else 'blue' end;
  old_wall_count := jsonb_array_length(result.state -> 'walls');
  new_wall_count := jsonb_array_length(next_state -> 'walls');

  if next_state -> other_side <> result.state -> other_side then raise exception 'Invalid opponent state'; end if;
  if new_wall_count = old_wall_count then
    if next_state -> 'walls' <> result.state -> 'walls' or next_state -> side = result.state -> side
      or next_blue_walls <> result.blue_walls or next_black_walls <> result.black_walls then
      raise exception 'Invalid pawn move';
    end if;
  elsif new_wall_count = old_wall_count + 1 then
    if next_state -> 'blue' <> result.state -> 'blue' or next_state -> 'black' <> result.state -> 'black' then raise exception 'Invalid wall move'; end if;
    if (side = 'blue' and (next_blue_walls <> result.blue_walls - 1 or next_black_walls <> result.black_walls))
      or (side = 'black' and (next_black_walls <> result.black_walls - 1 or next_blue_walls <> result.blue_walls)) then
      raise exception 'Invalid wall count';
    end if;
  else
    raise exception 'Invalid move';
  end if;

  if next_winner is not null and next_winner <> side then raise exception 'Invalid winner'; end if;
  update public.quoridor_rooms
  set state = next_state, blue_walls = next_blue_walls, black_walls = next_black_walls,
      turn = other_side, winner = next_winner,
      status = case when next_winner is null then 'active' else 'finished' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.restart_quoridor_room(room_id uuid)
returns public.quoridor_rooms language plpgsql security definer set search_path = public as $$
declare result public.quoridor_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.quoridor_rooms where id = room_id for update;
  if not found or (auth.uid() <> result.blue_player and auth.uid() <> result.black_player) then raise exception 'Room is unavailable'; end if;
  update public.quoridor_rooms
  set state = '{"blue":{"row":8,"col":4},"black":{"row":0,"col":4},"walls":[]}'::jsonb,
      blue_walls = 10, black_walls = 10, turn = 'blue', winner = null,
      status = case when result.black_player is null then 'waiting' else 'active' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_quoridor_room(text, text) to anon, authenticated;
grant execute on function public.join_quoridor_room(uuid, text, text) to anon, authenticated;
grant execute on function public.make_quoridor_move(uuid, jsonb, integer, integer, text) to anon, authenticated;
grant execute on function public.restart_quoridor_room(uuid) to anon, authenticated;

alter table public.quoridor_rooms replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quoridor_rooms') then
    alter publication supabase_realtime add table public.quoridor_rooms;
  end if;
end $$;
