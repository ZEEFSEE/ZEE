create table if not exists public.zhi_world_creator_position (
  entity_ref text primary key,
  x numeric not null default 1000,
  y numeric not null default 1000,
  current_scene text not null default '🌸中央广场',
  destination_scene text,
  destination_x numeric,
  destination_y numeric,
  walking boolean not null default false,
  walk_started_at timestamptz,
  walk_arrive_at timestamptz,
  world_width_m numeric not null default 2000,
  world_height_m numeric not null default 2000,
  updated_at timestamptz not null default now(),
  check (x >= 0 and x <= world_width_m),
  check (y >= 0 and y <= world_height_m)
);

alter table public.zhi_world_creator_position enable row level security;
drop policy if exists creator_position_public_read on public.zhi_world_creator_position;
create policy creator_position_public_read on public.zhi_world_creator_position
for select to anon, authenticated using (entity_ref = 'zhi-world-creator');
grant select on public.zhi_world_creator_position to anon, authenticated;
revoke insert, update, delete on public.zhi_world_creator_position from anon, authenticated;

insert into public.zhi_world_creator_position(entity_ref,x,y,current_scene)
select id,1000,1000,current_scene from public.zhi_world_creator_identity
where id='zhi-world-creator' and active=true
on conflict(entity_ref) do update set current_scene=excluded.current_scene,updated_at=now();
