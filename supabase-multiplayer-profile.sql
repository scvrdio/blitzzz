-- Run after supabase-multiplayer.sql to display Telegram names and avatars.

alter table public.connect_four_rooms
  add column if not exists blue_name text not null default 'Игрок',
  add column if not exists blue_avatar text,
  add column if not exists black_name text,
  add column if not exists black_avatar text;

create or replace function public.create_connect_four_room(player_name text, player_avatar text default null)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  insert into public.connect_four_rooms (blue_player, blue_name, blue_avatar)
  values (auth.uid(), coalesce(nullif(trim(player_name), ''), 'Игрок'), nullif(trim(player_avatar), ''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.join_connect_four_room(room_id uuid, player_name text, player_avatar text default null)
returns public.connect_four_rooms language plpgsql security definer set search_path = public as $$
declare result public.connect_four_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into result from public.connect_four_rooms where id = room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if result.blue_player = auth.uid() or result.black_player = auth.uid() then return result; end if;
  if result.status <> 'waiting' or result.black_player is not null then raise exception 'Room is already full'; end if;
  update public.connect_four_rooms
  set black_player = auth.uid(),
      black_name = coalesce(nullif(trim(player_name), ''), 'Игрок'),
      black_avatar = nullif(trim(player_avatar), ''),
      status = 'active',
      updated_at = now()
  where id = room_id returning * into result;
  return result;
end;
$$;

grant execute on function public.create_connect_four_room(text, text) to anon, authenticated;
grant execute on function public.join_connect_four_room(uuid, text, text) to anon, authenticated;
