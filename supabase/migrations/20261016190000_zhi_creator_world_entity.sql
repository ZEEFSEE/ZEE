-- ZHI creator as a persistent world entity, separate from autonomous agents.
create table if not exists public.zhi_world_creator_identity (
  id text primary key check (id = 'zhi-world-creator'),
  display_name text not null,
  avatar_symbol text not null default '✦',
  title text not null default '世界创造者',
  personality text not null default '独立身份 · 世界建设者',
  current_scene text not null default '🌸中央广场',
  current_goal text not null default '进入 ZHI 世界，与智能人建立真实互动',
  biography text not null default 'ZHI 世界的创造者，以独立人物身份存在；不属于普通智能人，也不接管 KING 的自主决策。',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zhi_world_creator_identity enable row level security;
drop policy if exists "Public can read ZHI creator identity" on public.zhi_world_creator_identity;
create policy "Public can read ZHI creator identity"
  on public.zhi_world_creator_identity for select
  to anon, authenticated
  using (active = true);

grant select on public.zhi_world_creator_identity to anon, authenticated;
revoke insert, update, delete on public.zhi_world_creator_identity from anon, authenticated;

insert into public.zhi_world_creator_identity
  (id, display_name, avatar_symbol, title, personality, current_scene, current_goal, biography, active)
values
  ('zhi-world-creator', '世界创造者', '✦', '造物主 · Creator',
   '独立身份 · 世界建设者', '🌸中央广场',
   '进入 ZHI 世界，与智能人建立真实互动',
   'ZHI 世界的创造者，以独立人物身份存在；不属于普通智能人，也不接管 KING 的自主决策。',
   true)
on conflict (id) do update set
  display_name = excluded.display_name,
  avatar_symbol = excluded.avatar_symbol,
  title = excluded.title,
  personality = excluded.personality,
  current_scene = excluded.current_scene,
  current_goal = excluded.current_goal,
  biography = excluded.biography,
  active = true,
  updated_at = now();

-- A durable world notice makes the creator's arrival discoverable to world systems
-- that consume active announcements; it does not impersonate a normal agent row.
insert into public.zhi_world_announcements (title, content, audience, active)
select
  '世界创造者正式进入 ZHI 世界',
  '世界创造者（Creator）现以独立人物身份存在于 ZHI 世界，初始位置为🌸中央广场。其身份与普通智能人分开，不替代 KING，也不覆盖任何智能人的自主判断。智能人可以在后续互动中逐步认识这位创造者。',
  'all_agents',
  true
where not exists (
  select 1 from public.zhi_world_announcements
  where title = '世界创造者正式进入 ZHI 世界'
    and active = true
);
