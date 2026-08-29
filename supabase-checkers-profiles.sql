-- Run once in Supabase → SQL Editor for existing Checkers multiplayer tables.
-- Adds Telegram avatars to the two player records and updates the room RPCs.

alter table public.checkers_rooms
  add column if not exists blue_avatar text,
  add column if not exists black_avatar text;

drop function if exists public.create_checkers_room(text);
create function public.create_checkers_room(player_name text, player_avatar text default null)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.checkers_rooms (blue_player, blue_name, blue_avatar)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), '')) returning * into result;
  return result;
end;
$$;

drop function if exists public.join_checkers_room(uuid, text);
create function public.join_checkers_room(room_id uuid, player_name text, player_avatar text default null)
returns public.checkers_rooms language plpgsql security definer set search_path = public as $$
declare result public.checkers_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.checkers_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.checkers_rooms
    set black_player = auth.uid(), black_name = coalesce(nullif(trim(player_name), ''), 'Игрок'),
      black_avatar = nullif(trim(player_avatar), ''), status = 'active', updated_at = now()
    where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_checkers_room(text, text) to anon, authenticated;
grant execute on function public.join_checkers_room(uuid, text, text) to anon, authenticated;
