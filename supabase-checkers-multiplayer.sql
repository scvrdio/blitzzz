-- Run once in Supabase → SQL Editor → New query.
-- Authentication → Sign In / Providers → Anonymous must be enabled.

create table public.checkers_rooms (
  id uuid primary key default gen_random_uuid(),
  blue_player uuid not null references auth.users(id),
  black_player uuid references auth.users(id),
  blue_name text not null default 'Игрок',
  black_name text,
  blue_avatar text,
  black_avatar text,
  board jsonb not null default '[null,"black",null,"black",null,"black",null,"black","black",null,"black",null,"black",null,"black",null,null,"black",null,"black",null,"black",null,"black",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"blue",null,"blue",null,"blue",null,"blue",null,null,"blue",null,"blue",null,"blue",null,"blue","blue",null,"blue",null,"blue",null,"blue",null]'::jsonb,
  turn text not null default 'blue' check (turn in ('blue', 'black')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  winner text check (winner in ('blue', 'black')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checkers_rooms enable row level security;

-- Only the two players can subscribe to or read their room.
create policy "Players can read their checkers room" on public.checkers_rooms
  for select to authenticated using (auth.uid() = blue_player or auth.uid() = black_player);

create or replace function public.create_checkers_room(player_name text, player_avatar text default null)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.checkers_rooms (blue_player, blue_name, blue_avatar)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), '')) returning * into result;
  return result;
end;
$$;

create or replace function public.join_checkers_room(room_id uuid, player_name text, player_avatar text default null)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.checkers_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.checkers_rooms set black_player = auth.uid(), black_name = coalesce(nullif(trim(player_name), ''), 'Игрок'), black_avatar = nullif(trim(player_avatar), ''), status = 'active', updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

create or replace function public.make_checkers_move(room_id uuid, next_board jsonb, next_turn text, next_winner text default null)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms; side text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if jsonb_typeof(next_board) <> 'array' or jsonb_array_length(next_board) <> 64 then raise exception 'Invalid board'; end if;
  if next_turn not in ('blue', 'black') then raise exception 'Invalid turn'; end if;
  select * into result from public.checkers_rooms where id = room_id for update;
  if not found or result.status <> 'active' then raise exception 'Game is unavailable'; end if;
  side := case when result.blue_player = auth.uid() then 'blue' when result.black_player = auth.uid() then 'black' else null end;
  if side is null or side <> result.turn then raise exception 'It is not your turn'; end if;
  update public.checkers_rooms set board = next_board, turn = next_turn, winner = next_winner,
    status = case when next_winner is null then 'active' else 'finished' end, updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

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

grant execute on function public.create_checkers_room(text, text) to anon, authenticated;
grant execute on function public.join_checkers_room(uuid, text, text) to anon, authenticated;
grant execute on function public.make_checkers_move(uuid, jsonb, text, text) to anon, authenticated;
grant execute on function public.restart_checkers_room(uuid) to anon, authenticated;

alter table public.checkers_rooms replica identity full;
alter publication supabase_realtime add table public.checkers_rooms;
