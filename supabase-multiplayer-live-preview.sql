-- Run after the earlier multiplayer SQL scripts.
-- Broadcasts the selected column before a player releases their chip.

alter table public.connect_four_rooms
  add column if not exists preview_player uuid references auth.users(id),
  add column if not exists preview_column integer check (preview_column between 0 and 6);

create or replace function public.set_connect_four_preview(room_id uuid, selected_column integer)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
declare chip text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if selected_column not between 0 and 6 then raise exception 'Invalid column'; end if;
  select * into result from public.connect_four_rooms where id = room_id for update;
  if not found or result.status <> 'active' then raise exception 'Game is unavailable'; end if;
  chip := case when result.blue_player = auth.uid() then 'blue' when result.black_player = auth.uid() then 'black' else null end;
  if chip is null or chip <> result.turn then raise exception 'It is not your turn'; end if;
  update public.connect_four_rooms
  set preview_player = auth.uid(), preview_column = selected_column, updated_at = now()
  where id = room_id returning * into result;
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
      preview_player = null,
      preview_column = null,
      updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

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
      turn = 'blue', winner = null, status = 'active', preview_player = null, preview_column = null, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.set_connect_four_preview(uuid, integer) to anon, authenticated;
