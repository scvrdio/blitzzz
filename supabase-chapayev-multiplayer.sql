-- Run once in Supabase → SQL Editor. Anonymous authentication must be enabled.

create table public.chapayev_rooms (
  id uuid primary key default gen_random_uuid(),
  blue_player uuid not null references auth.users(id),
  black_player uuid references auth.users(id),
  blue_name text not null default 'Игрок',
  black_name text,
  blue_avatar text,
  black_avatar text,
  pieces jsonb not null,
  ranks jsonb not null default '{"blue":7,"black":0}'::jsonb,
  turn text not null default 'blue' check (turn in ('blue', 'black')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  winner text check (winner in ('blue', 'black')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chapayev_rooms enable row level security;
create policy "Players can read their Chapayev room" on public.chapayev_rooms
  for select to authenticated using (auth.uid() = blue_player or auth.uid() = black_player);

create or replace function public.chapayev_initial_pieces()
returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('id', side || '-' || idx, 'side', side, 'x', (idx + .5) / 8, 'y', row + .5 / 8, 'vx', 0, 'vy', 0))
  from (values ('blue'::text, 7::numeric), ('black'::text, 0::numeric)) sides(side, row)
  cross join generate_series(0, 7) idx;
$$;

create or replace function public.create_chapayev_room(player_name text, player_avatar text default null)
returns public.chapayev_rooms language plpgsql security definer set search_path = public as $$
declare result public.chapayev_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.chapayev_rooms (blue_player, blue_name, blue_avatar, pieces)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), ''), public.chapayev_initial_pieces())
  returning * into result;
  return result;
end;
$$;

create or replace function public.join_chapayev_room(room_id uuid, player_name text, player_avatar text default null)
returns public.chapayev_rooms language plpgsql security definer set search_path = public as $$
declare result public.chapayev_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.chapayev_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.chapayev_rooms set black_player = auth.uid(), black_name = coalesce(nullif(trim(player_name), ''), 'Игрок'), black_avatar = nullif(trim(player_avatar), ''), status = 'active', updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.make_chapayev_move(room_id uuid, next_pieces jsonb, next_ranks jsonb, next_turn text, next_winner text default null)
returns public.chapayev_rooms language plpgsql security definer set search_path = public as $$
declare result public.chapayev_rooms; side text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if jsonb_typeof(next_pieces) <> 'array' or jsonb_typeof(next_ranks) <> 'object' then raise exception 'Invalid game state'; end if;
  if next_turn not in ('blue', 'black') or (next_winner is not null and next_winner not in ('blue', 'black')) then raise exception 'Invalid turn'; end if;
  select * into result from public.chapayev_rooms where id = room_id for update;
  if not found or result.status <> 'active' then raise exception 'Game is unavailable'; end if;
  side := case when result.blue_player = auth.uid() then 'blue' when result.black_player = auth.uid() then 'black' else null end;
  if side is null or side <> result.turn then raise exception 'It is not your turn'; end if;
  update public.chapayev_rooms set pieces = next_pieces, ranks = next_ranks, turn = next_turn, winner = next_winner,
    status = case when next_winner is null then 'active' else 'finished' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.restart_chapayev_room(room_id uuid)
returns public.chapayev_rooms language plpgsql security definer set search_path = public as $$
declare result public.chapayev_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.chapayev_rooms where id = room_id for update;
  if not found or (auth.uid() <> result.blue_player and auth.uid() <> result.black_player) then raise exception 'Room is unavailable'; end if;
  update public.chapayev_rooms set pieces = public.chapayev_initial_pieces(), ranks = '{"blue":7,"black":0}'::jsonb,
    turn = 'blue', winner = null, status = case when result.black_player is null then 'waiting' else 'active' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_chapayev_room(text, text) to anon, authenticated;
grant execute on function public.join_chapayev_room(uuid, text, text) to anon, authenticated;
grant execute on function public.make_chapayev_move(uuid, jsonb, jsonb, text, text) to anon, authenticated;
grant execute on function public.restart_chapayev_room(uuid) to anon, authenticated;

alter table public.chapayev_rooms replica identity full;
alter publication supabase_realtime add table public.chapayev_rooms;
