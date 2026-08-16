-- Run this once in Supabase: SQL Editor → New query.
-- The browser uses anonymous Supabase authentication, so enable it first:
-- Authentication → Providers → Anonymous Sign-Ins.

create table if not exists public.connect_four_rooms (
  id uuid primary key default gen_random_uuid(),
  blue_player uuid not null references auth.users(id),
  black_player uuid references auth.users(id),
  board jsonb not null default '[ [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null], [null,null,null,null,null,null,null] ]'::jsonb,
  turn text not null default 'blue' check (turn in ('blue', 'black')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  winner text check (winner in ('blue', 'black', 'draw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connect_four_rooms enable row level security;

create policy "Rooms can be read by invitees" on public.connect_four_rooms
  for select to authenticated, anon using (true);

create or replace function public.connect_four_has_line(grid jsonb, origin_row integer, origin_col integer, chip text)
returns boolean language plpgsql immutable as $$
declare
  direction integer[];
  directions integer[][] := array[[0,1],[1,0],[1,1],[1,-1]];
  row_index integer;
  col_index integer;
  step integer;
  count integer;
begin
  foreach direction slice 1 in array directions loop
    count := 1;
    for step in 1..5 loop
      row_index := origin_row + direction[1] * step;
      col_index := origin_col + direction[2] * step;
      exit when row_index not between 0 and 5 or col_index not between 0 and 6 or grid -> row_index ->> col_index is distinct from chip;
      count := count + 1;
    end loop;
    for step in 1..5 loop
      row_index := origin_row - direction[1] * step;
      col_index := origin_col - direction[2] * step;
      exit when row_index not between 0 and 5 or col_index not between 0 and 6 or grid -> row_index ->> col_index is distinct from chip;
      count := count + 1;
    end loop;
    if count >= 4 then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function public.create_connect_four_room()
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.connect_four_rooms (blue_player) values (auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.join_connect_four_room(room_id uuid)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.connect_four_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.connect_four_rooms set black_player = auth.uid(), status = 'active', updated_at = now() where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.make_connect_four_move(room_id uuid, selected_column integer)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare
  result public.connect_four_rooms;
  chip text;
  row_index integer;
  next_board jsonb;
  next_winner text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if selected_column not between 0 and 6 then raise exception 'Invalid column'; end if;
  select * into result from public.connect_four_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.status <> 'active' then raise exception 'Game has not started'; end if;
  chip := case when result.blue_player = auth.uid() then 'blue' when result.black_player = auth.uid() then 'black' else null end;
  if chip is null or chip <> result.turn then raise exception 'It is not your turn'; end if;
  row_index := null;
  for candidate in reverse 5..0 loop
    if result.board -> candidate ->> selected_column is null then row_index := candidate; exit; end if;
  end loop;
  if row_index is null then raise exception 'Column is full'; end if;
  next_board := jsonb_set(result.board, array[row_index::text, selected_column::text], to_jsonb(chip), false);
  if public.connect_four_has_line(next_board, row_index, selected_column, chip) then
    next_winner := chip;
  elsif not exists (select 1 from jsonb_array_elements(next_board) row_cells, jsonb_array_elements(row_cells) cell where cell = 'null'::jsonb) then
    next_winner := 'draw';
  end if;
  update public.connect_four_rooms
  set board = next_board,
      turn = case when chip = 'blue' then 'black' else 'blue' end,
      winner = next_winner,
      status = case when next_winner is null then 'active' else 'finished' end,
      updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_connect_four_room() to anon, authenticated;
grant execute on function public.join_connect_four_room(uuid) to anon, authenticated;
grant execute on function public.make_connect_four_move(uuid, integer) to anon, authenticated;

alter table public.connect_four_rooms replica identity full;
alter publication supabase_realtime add table public.connect_four_rooms;
