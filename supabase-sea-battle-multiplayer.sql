-- Multiplayer storage and authoritative rules for Sea Battle.
-- Run this file once in the Supabase SQL editor.

create or replace function public.sea_battle_empty_shots()
returns jsonb
language sql
immutable
as $$
  select jsonb_agg(null::jsonb order by value)
  from generate_series(0, 99) as value;
$$;

create table if not exists public.sea_battle_rooms (
  id uuid primary key default gen_random_uuid(),
  host_player uuid not null references auth.users(id) on delete cascade,
  guest_player uuid references auth.users(id) on delete set null,
  host_name text,
  guest_name text,
  host_avatar text,
  guest_avatar text,
  status text not null default 'waiting' check (status in ('waiting', 'placing', 'active', 'finished')),
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  turn text not null default 'host' check (turn in ('host', 'guest')),
  winner text check (winner is null or winner in ('host', 'guest')),
  host_shots jsonb not null default public.sea_battle_empty_shots(),
  guest_shots jsonb not null default public.sea_battle_empty_shots(),
  host_sunk jsonb not null default '[]'::jsonb,
  guest_sunk jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sea_battle_fleets (
  room_id uuid not null references public.sea_battle_rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  ships jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

alter table public.sea_battle_rooms enable row level security;
alter table public.sea_battle_fleets enable row level security;

drop policy if exists "Players can view their sea battle room" on public.sea_battle_rooms;
create policy "Players can view their sea battle room"
on public.sea_battle_rooms for select
to authenticated
using (auth.uid() = host_player or auth.uid() = guest_player);

drop policy if exists "Players can view their own sea battle fleet" on public.sea_battle_fleets;
create policy "Players can view their own sea battle fleet"
on public.sea_battle_fleets for select
to authenticated
using (auth.uid() = player_id);

create or replace function public.sea_battle_valid_fleet(fleet jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  ship jsonb;
  cell_value jsonb;
  cells integer[];
  occupied integer[] := '{}'::integer[];
  cell integer;
  other integer;
  ship_size integer;
  row_min integer;
  row_max integer;
  col_min integer;
  col_max integer;
  size_1 integer := 0;
  size_2 integer := 0;
  size_3 integer := 0;
  size_4 integer := 0;
begin
  if jsonb_typeof(fleet) <> 'array' or jsonb_array_length(fleet) <> 10 then return false; end if;

  for ship in select value from jsonb_array_elements(fleet)
  loop
    if jsonb_typeof(ship) <> 'object' or jsonb_typeof(ship -> 'cells') <> 'array' then return false; end if;
    ship_size := (ship ->> 'size')::integer;
    if ship_size not between 1 and 4 or jsonb_array_length(ship -> 'cells') <> ship_size then return false; end if;

    cells := '{}'::integer[];
    for cell_value in select value from jsonb_array_elements(ship -> 'cells')
    loop
      cell := (cell_value #>> '{}')::integer;
      if cell < 0 or cell > 99 or cell = any(cells) then return false; end if;
      cells := array_append(cells, cell);
    end loop;

    select min(cell_values.value / 10), max(cell_values.value / 10), min(cell_values.value % 10), max(cell_values.value % 10)
      into row_min, row_max, col_min, col_max
      from unnest(cells) as cell_values(value);
    if not (
      (row_min = row_max and col_max - col_min + 1 = ship_size)
      or (col_min = col_max and row_max - row_min + 1 = ship_size)
    ) then return false; end if;

    foreach cell in array cells loop
      foreach other in array occupied loop
        if abs(cell / 10 - other / 10) <= 1 and abs(cell % 10 - other % 10) <= 1 then return false; end if;
      end loop;
    end loop;
    occupied := occupied || cells;

    if ship_size = 1 then size_1 := size_1 + 1;
    elsif ship_size = 2 then size_2 := size_2 + 1;
    elsif ship_size = 3 then size_3 := size_3 + 1;
    else size_4 := size_4 + 1;
    end if;
  end loop;

  return size_1 = 4 and size_2 = 3 and size_3 = 2 and size_4 = 1;
exception when others then
  return false;
end;
$$;

create or replace function public.sea_battle_ship_sunk(ship jsonb, shots jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1 from jsonb_array_elements(ship -> 'cells') as ship_cells(value)
    where shots ->> ((ship_cells.value #>> '{}')::integer) is distinct from 'hit'
  );
$$;

create or replace function public.sea_battle_all_sunk(fleet jsonb, shots jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1 from jsonb_array_elements(fleet) as fleet_ships(value)
    where not public.sea_battle_ship_sunk(fleet_ships.value, shots)
  );
$$;

create or replace function public.sea_battle_mark_water(shots jsonb, ship jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  cell_value jsonb;
  cell integer;
  ship_row integer;
  ship_col integer;
  next_row integer;
  next_col integer;
  target integer;
  row_offset integer;
  col_offset integer;
begin
  for cell_value in select value from jsonb_array_elements(ship -> 'cells')
  loop
    cell := (cell_value #>> '{}')::integer;
    ship_row := cell / 10;
    ship_col := cell % 10;
    for row_offset in -1..1 loop
      for col_offset in -1..1 loop
        next_row := ship_row + row_offset;
        next_col := ship_col + col_offset;
        if next_row between 0 and 9 and next_col between 0 and 9 then
          target := next_row * 10 + next_col;
          if shots -> target = 'null'::jsonb then
            shots := jsonb_set(shots, array[target::text], '"miss"'::jsonb, false);
          end if;
        end if;
      end loop;
    end loop;
  end loop;
  return shots;
end;
$$;

create or replace function public.create_sea_battle_room(player_name text, player_avatar text default null)
returns public.sea_battle_rooms
language plpgsql
security definer
set search_path = public
as $$
declare result public.sea_battle_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.sea_battle_rooms (host_player, host_name, host_avatar)
  values (auth.uid(), nullif(trim(player_name), ''), nullif(trim(player_avatar), ''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.join_sea_battle_room(room_id uuid, player_name text, player_avatar text default null)
returns public.sea_battle_rooms
language plpgsql
security definer
set search_path = public
as $$
declare result public.sea_battle_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into result from public.sea_battle_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.host_player <> auth.uid() and result.guest_player is not null and result.guest_player <> auth.uid() then
    raise exception 'Room is full';
  end if;
  if result.host_player <> auth.uid() and result.guest_player is null then
    update public.sea_battle_rooms
      set guest_player = auth.uid(), guest_name = nullif(trim(player_name), ''),
          guest_avatar = nullif(trim(player_avatar), ''), status = 'placing', updated_at = now()
      where id = room_id returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.set_sea_battle_fleet(room_id uuid, fleet jsonb)
returns public.sea_battle_rooms
language plpgsql
security definer
set search_path = public
as $$
declare result public.sea_battle_rooms;
declare side text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.sea_battle_valid_fleet(fleet) then raise exception 'Invalid fleet'; end if;
  select * into result from public.sea_battle_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.status in ('active', 'finished') then raise exception 'Game already started'; end if;
  side := case when result.host_player = auth.uid() then 'host' when result.guest_player = auth.uid() then 'guest' end;
  if side is null then raise exception 'Not a room player'; end if;

  insert into public.sea_battle_fleets (room_id, player_id, ships)
  values (room_id, auth.uid(), fleet)
  on conflict (room_id, player_id) do update set ships = excluded.ships, updated_at = now();

  update public.sea_battle_rooms set
    host_ready = case when side = 'host' then true else host_ready end,
    guest_ready = case when side = 'guest' then true else guest_ready end,
    status = case
      when guest_player is not null and (host_ready or side = 'host') and (guest_ready or side = 'guest') then 'active'
      when guest_player is not null then 'placing'
      else 'waiting'
    end,
    turn = 'host', winner = null,
    host_shots = public.sea_battle_empty_shots(), guest_shots = public.sea_battle_empty_shots(),
    host_sunk = '[]'::jsonb, guest_sunk = '[]'::jsonb,
    updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.fire_sea_battle(room_id uuid, target integer)
returns public.sea_battle_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.sea_battle_rooms;
  shooter text;
  opponent text;
  opponent_id uuid;
  shots jsonb;
  sunk_ships jsonb;
  enemy_fleet jsonb;
  hit_ship jsonb;
  hit boolean := false;
  sunk boolean := false;
  won boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target < 0 or target > 99 then raise exception 'Invalid target'; end if;
  select * into result from public.sea_battle_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  shooter := case when result.host_player = auth.uid() then 'host' when result.guest_player = auth.uid() then 'guest' end;
  if shooter is null then raise exception 'Not a room player'; end if;
  if result.status <> 'active' or result.turn <> shooter then raise exception 'Not your turn'; end if;

  opponent := case when shooter = 'host' then 'guest' else 'host' end;
  opponent_id := case when opponent = 'host' then result.host_player else result.guest_player end;
  shots := case when shooter = 'host' then result.host_shots else result.guest_shots end;
  sunk_ships := case when opponent = 'host' then result.host_sunk else result.guest_sunk end;
  if shots -> target <> 'null'::jsonb then raise exception 'Cell already fired at'; end if;
  select ships into enemy_fleet from public.sea_battle_fleets where sea_battle_fleets.room_id = fire_sea_battle.room_id and player_id = opponent_id;
  if enemy_fleet is null then raise exception 'Opponent fleet is missing'; end if;

  select fleet_ships.value into hit_ship
  from jsonb_array_elements(enemy_fleet) as fleet_ships(value)
  where exists (
    select 1 from jsonb_array_elements(fleet_ships.value -> 'cells') as ship_cells(value)
    where (ship_cells.value #>> '{}')::integer = target
  )
  limit 1;
  hit := hit_ship is not null;
  shots := jsonb_set(shots, array[target::text], case when hit then '"hit"'::jsonb else '"miss"'::jsonb end, false);

  if hit then
    sunk := public.sea_battle_ship_sunk(hit_ship, shots);
    if sunk then
      if not exists (
        select 1 from jsonb_array_elements(sunk_ships) as known_ships(value)
        where known_ships.value -> 'cells' = hit_ship -> 'cells'
      ) then
        sunk_ships := sunk_ships || jsonb_build_array(hit_ship);
      end if;
      shots := public.sea_battle_mark_water(shots, hit_ship);
    end if;
    won := public.sea_battle_all_sunk(enemy_fleet, shots);
  end if;

  update public.sea_battle_rooms set
    host_shots = case when shooter = 'host' then shots else host_shots end,
    guest_shots = case when shooter = 'guest' then shots else guest_shots end,
    host_sunk = case when opponent = 'host' then sunk_ships else host_sunk end,
    guest_sunk = case when opponent = 'guest' then sunk_ships else guest_sunk end,
    turn = case when hit or won then shooter else opponent end,
    winner = case when won then shooter else null end,
    status = case when won then 'finished' else status end,
    updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.restart_sea_battle_room(room_id uuid)
returns public.sea_battle_rooms
language plpgsql
security definer
set search_path = public
as $$
declare result public.sea_battle_rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into result from public.sea_battle_rooms where id = room_id for update;
  if not found or (result.host_player <> auth.uid() and result.guest_player <> auth.uid()) then raise exception 'Not a room player'; end if;
  delete from public.sea_battle_fleets where sea_battle_fleets.room_id = restart_sea_battle_room.room_id;
  update public.sea_battle_rooms set
    status = case when guest_player is null then 'waiting' else 'placing' end,
    host_ready = false, guest_ready = false, turn = 'host', winner = null,
    host_shots = public.sea_battle_empty_shots(), guest_shots = public.sea_battle_empty_shots(),
    host_sunk = '[]'::jsonb, guest_sunk = '[]'::jsonb, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

revoke all on function public.create_sea_battle_room(text, text) from public;
revoke all on function public.join_sea_battle_room(uuid, text, text) from public;
revoke all on function public.set_sea_battle_fleet(uuid, jsonb) from public;
revoke all on function public.fire_sea_battle(uuid, integer) from public;
revoke all on function public.restart_sea_battle_room(uuid) from public;
grant execute on function public.create_sea_battle_room(text, text) to authenticated;
grant execute on function public.join_sea_battle_room(uuid, text, text) to authenticated;
grant execute on function public.set_sea_battle_fleet(uuid, jsonb) to authenticated;
grant execute on function public.fire_sea_battle(uuid, integer) to authenticated;
grant execute on function public.restart_sea_battle_room(uuid) to authenticated;
grant select on public.sea_battle_rooms, public.sea_battle_fleets to authenticated;

alter table public.sea_battle_rooms replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sea_battle_rooms'
  ) then
    alter publication supabase_realtime add table public.sea_battle_rooms;
  end if;
end;
$$;
