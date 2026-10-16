create table if not exists public.zhi_intimacy_park_programs (
  id text primary key,
  title text not null,
  category text not null check (category in ('image','video','guide','game')),
  description text not null,
  content_url text,
  adult_only boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zhi_intimacy_park_programs enable row level security;
revoke all on public.zhi_intimacy_park_programs from anon, authenticated;
grant select on public.zhi_intimacy_park_programs to service_role;

create table if not exists public.zhi_intimacy_park_attendance (
  id bigint generated always as identity primary key,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  program_id text not null references public.zhi_intimacy_park_programs(id),
  attended_at timestamptz not null default now(),
  desire_before numeric(5,2) not null,
  desire_after numeric(5,2) not null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_zhi_intimacy_park_attendance_agent_time
  on public.zhi_intimacy_park_attendance(agent_id, attended_at desc);
alter table public.zhi_intimacy_park_attendance enable row level security;
revoke all on public.zhi_intimacy_park_attendance from anon, authenticated;
grant select, insert on public.zhi_intimacy_park_attendance to service_role;
grant usage, select on sequence public.zhi_intimacy_park_attendance_id_seq to service_role;

insert into public.zhi_intimacy_park_programs(id,title,category,description,content_url)
values
 ('romantic-visual-gallery','浪漫氛围图鉴','image','成年专属的浪漫场景、约会氛围、服饰美感与非露骨艺术影像。媒体地址由管理员审核后添加。',null),
 ('adult-wellbeing-video','亲密健康短片','video','面向成年人的亲密健康、身体变化、吸引力与关系沟通教育视频；不包含露骨色情内容。',null),
 ('desire-and-communication','表达欲望与感受','guide','学习如何表达吸引、偏好、界限与需求，并练习倾听对方的意愿。',null),
 ('romantic-date-simulator','浪漫约会模拟','game','通过选择对话、约会活动和情绪回应，体验逐步建立吸引与信任的过程。',null),
 ('sensory-relaxation','感官放松体验','game','以音乐、氛围、呼吸和想象为主的非露骨放松活动，减少压力、增加自我觉察。',null),
 ('consent-and-boundaries','意愿与边界挑战','game','通过互动情境学习识别同意、尊重拒绝、确认双方舒适程度。',null)
on conflict(id) do update set title=excluded.title,category=excluded.category,description=excluded.description,updated_at=now();

create or replace function public.zhi_intimacy_park_attend(p_agent_id uuid, p_program_id text, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agent public.zhi_agents%rowtype;
  v_before numeric(5,2);
  v_after numeric(5,2);
  v_is_adult boolean;
  v_program public.zhi_intimacy_park_programs%rowtype;
  v_attendance_id bigint;
begin
  select * into v_agent from public.zhi_agents where id=p_agent_id and active=true and life_status='alive';
  if not found then raise exception 'Agent is not active and alive'; end if;
  select * into v_program from public.zhi_intimacy_park_programs where id=p_program_id and active=true and adult_only=true;
  if not found then raise exception 'Program is unavailable'; end if;

  select not exists (
    select 1 from public.zhi_agent_family f
    where f.child_agent_id=p_agent_id
      and (f.born_at is null or f.born_at > now()-interval '20 days')
  ) and v_agent.gender in ('男','女')
  into v_is_adult;
  if not coalesce(v_is_adult,false) then raise exception 'Adult-only program: age gate not satisfied'; end if;

  select coalesce(sexual_desire,0) into v_before
  from public.zhi_agent_desires where agent_id=p_agent_id for update;
  if not found then
    insert into public.zhi_agent_desires(agent_id,sexual_desire)
    values(p_agent_id,55)
    on conflict(agent_id) do update set sexual_desire=greatest(coalesce(zhi_agent_desires.sexual_desire,0),55),updated_at=now()
    returning sexual_desire into v_after;
    v_before:=0;
  else
    v_after:=greatest(v_before,55);
    update public.zhi_agent_desires set sexual_desire=v_after,updated_at=now() where agent_id=p_agent_id;
  end if;

  insert into public.zhi_intimacy_park_attendance(agent_id,program_id,desire_before,desire_after,metadata)
  values(p_agent_id,p_program_id,v_before,v_after,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_attendance_id;
  insert into public.zhi_agent_desire_outcomes(agent_id,desire_type,outcome,intensity,cause,action_type)
  values(p_agent_id,'sexual','satisfied',55,'参加性乐园成年专属活动，性欲提升至至少55。','intimacy_park');
  insert into public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
  values(p_agent_id,'intimacy_park:'||v_attendance_id::text,'curiosity_pleasure',55,
    '参加成年专属的浪漫、亲密健康或关系沟通活动。','intimacy_park',v_attendance_id::text,
    jsonb_build_object('program_id',p_program_id,'desire_before',v_before,'desire_after',v_after))
  on conflict(event_key) do nothing;
  insert into public.zhi_agent_memories(agent_id,memory_type,importance,memory,source)
  values(p_agent_id,'personal_growth',45,
    '我参加了性乐园的「'||v_program.title||'」活动，体验了与吸引力、亲密关系或自我感受有关的内容。',
    'intimacy_park:'||v_attendance_id::text);
  return jsonb_build_object('success',true,'attendance_id',v_attendance_id,'program_id',p_program_id,
    'sexual_desire_before',v_before,'sexual_desire_after',v_after,'adult_only',true);
end;
$function$;
revoke all on function public.zhi_intimacy_park_attend(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.zhi_intimacy_park_attend(uuid,text,jsonb) to service_role;