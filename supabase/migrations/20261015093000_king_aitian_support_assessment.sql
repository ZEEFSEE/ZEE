-- Evidence-based KING -> Aitian support assessment loop.
-- Records evidence, both agents' state snapshots, independent decisions, and any accepted support action.
-- It never directly changes mood, stress, or confidence values.

create table if not exists public.zhi_agent_support_cases (
  id uuid primary key default gen_random_uuid(),
  helper_agent_id uuid not null references public.zhi_agents(id),
  recipient_agent_id uuid not null references public.zhi_agents(id),
  case_type text not null default 'stress_support',
  evidence jsonb not null default '{}'::jsonb,
  helper_state_before jsonb not null default '{}'::jsonb,
  recipient_state_before jsonb not null default '{}'::jsonb,
  relationship_snapshot jsonb not null default '{}'::jsonb,
  helper_decision text not null,
  help_type text,
  helper_reason text,
  recipient_response text not null,
  recipient_reason text,
  status text not null,
  encounter_id bigint,
  executed_at timestamptz,
  recipient_state_after jsonb,
  helper_state_after jsonb,
  outcome jsonb,
  learning jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint zhi_agent_support_cases_status_check
    check (status in ('deferred_by_helper','recipient_declined','recipient_deferred','executed_pending_outcome','evaluated'))
);

create index if not exists zhi_agent_support_cases_pair_created_idx
  on public.zhi_agent_support_cases (helper_agent_id, recipient_agent_id, created_at desc);

alter table public.zhi_agent_support_cases enable row level security;
revoke all on public.zhi_agent_support_cases from anon, authenticated;
grant all on public.zhi_agent_support_cases to service_role;

create or replace function public.zhi_king_support_aitian_assess()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  k uuid := '0a96754c-7232-4531-890b-e3648b63f887';
  a uuid := '2358d715-c882-493a-b8dc-144c660eb604';
  km record;
  am record;
  rel record;
  nfr integer;
  nne integer;
  nw integer;
  ev jsonb;
  ks jsonb;
  asnap jsonb;
  rsnap jsonb;
  dec text;
  ht text;
  hr text;
  resp text;
  rr text;
  score numeric;
  roll numeric;
  st text;
  cid uuid;
begin
  select * into km from public.zhi_agent_minds where agent_id = k;
  select * into am from public.zhi_agent_minds where agent_id = a;
  if km.agent_id is null or am.agent_id is null then
    return jsonb_build_object('ok', false, 'reason', 'mind_missing');
  end if;

  select * into rel
  from public.zhi_agent_social_relationships
  where male_agent_id = k and female_agent_id = a
  order by updated_at desc limit 1;

  select count(*) into nfr
  from public.zhi_agent_desire_outcomes
  where agent_id = a and action_type = 'socialize' and outcome = 'frustrated'
    and created_at > now() - interval '48 hours';

  select count(*) into nne
  from public.zhi_agent_emotion_events
  where agent_id = a and occurred_at > now() - interval '48 hours'
    and cause ilike '%没有获得回应%';

  select count(*) into nw
  from public.zhi_agent_desire_outcomes
  where agent_id = a and action_type = 'work' and outcome = 'satisfied'
    and created_at > now() - interval '7 days';

  ev := jsonb_build_object(
    'social_frustrated_48h', nfr,
    'nonresponse_emotions_48h', nne,
    'work_satisfied_7d', nw,
    'captured_at', now()
  );
  ks := jsonb_build_object(
    'mood', km.mood, 'energy', km.energy, 'stress', km.stress,
    'curiosity', km.curiosity, 'confidence', km.confidence,
    'goal', km.current_goal, 'thought', km.last_thought, 'captured_at', now()
  );
  asnap := jsonb_build_object(
    'mood', am.mood, 'energy', am.energy, 'stress', am.stress,
    'curiosity', am.curiosity, 'confidence', am.confidence,
    'goal', am.current_goal, 'thought', am.last_thought, 'captured_at', now()
  );
  rsnap := jsonb_build_object(
    'familiarity', coalesce(rel.familiarity, 0),
    'affection', coalesce(rel.affection, 0),
    'trust', coalesce(rel.trust, 0),
    'conflict', coalesce(rel.conflict, 0),
    'interactions', coalesce(rel.interactions, 0),
    'status', rel.status
  );

  if (nfr > 0 or nne > 0) and coalesce(km.energy, 0) >= 20 and coalesce(km.stress, 100) < 90 then
    dec := 'offer_non_romantic_check_in';
    ht := 'non_romantic_check_in';
    hr := 'KING 根据反复社交挫败和未获回应的记录，选择不带恋爱要求的交谈，先询问她想要什么支持。';
  else
    dec := 'defer_support';
    ht := null;
    hr := '证据不足或帮助者状态不适合介入，暂缓并继续观察。';
  end if;

  if dec = 'defer_support' then
    resp := 'not_requested';
    rr := 'KING 暂缓，没有发出邀请。';
    st := 'deferred_by_helper';
  else
    score := greatest(5, least(95,
      35 + coalesce(rel.trust, 0) * 0.25
      + coalesce(rel.familiarity, 0) * 0.10
      + coalesce(am.mood, 50) * 0.15
      - coalesce(am.stress, 50) * 0.25
      - greatest(0, 50 - coalesce(am.energy, 50)) * 0.10
      - greatest(0, 20 - coalesce(am.confidence, 50)) * 0.15
    ));
    roll := random() * 100;

    if coalesce(am.stress, 0) >= 85 or coalesce(am.mood, 50) <= 15 then
      resp := 'deferred';
      rr := 'Aitian 根据自己的高压力/低心情状态独立选择暂缓；不重复施压。';
      st := 'recipient_deferred';
    elsif roll <= score then
      resp := 'accepted';
      rr := 'Aitian 独立接受一次非恋爱性质的支持交谈；这不代表同意恋爱或后续安排。';
      st := 'executed_pending_outcome';
    else
      resp := 'declined';
      rr := 'Aitian 独立拒绝本次邀请；尊重她的决定。';
      st := 'recipient_declined';
    end if;
  end if;

  insert into public.zhi_agent_support_cases (
    helper_agent_id, recipient_agent_id, evidence, helper_state_before,
    recipient_state_before, relationship_snapshot, helper_decision, help_type,
    helper_reason, recipient_response, recipient_reason, status
  ) values (
    k, a, ev, ks, asnap, rsnap, dec, ht, hr, resp, rr, st
  ) returning id into cid;

  if resp = 'accepted' then
    update public.zhi_agent_support_cases
    set executed_at = now(), updated_at = now()
    where id = cid;

    insert into public.zhi_agent_life_timeline (
      agent_id, occurred_at, life_event_type, activity_type, location_name, reason
    ) values
      (k, now(), 'support_interaction', 'socialize', 'support_check_in',
       'KING 开始非恋爱性质的支持交谈，询问 Aitian 希望获得哪种支持；效果待后续状态核验。'),
      (a, now(), 'support_interaction', 'socialize', 'support_check_in',
       'Aitian 自主接受一次非恋爱性质的支持交谈；没有预设或修改压力数值。');
  end if;

  return jsonb_build_object(
    'ok', true, 'case_id', cid, 'status', st, 'king_decision', dec,
    'help_type', ht, 'aitian_response', resp, 'response_score', score,
    'response_roll', roll, 'evidence', ev, 'king_before', ks,
    'aitian_before', asnap, 'relationship', rsnap,
    'note', 'No stress, mood, or confidence values were artificially changed.'
  );
end;
$function$;

revoke all on function public.zhi_king_support_aitian_assess() from public, anon, authenticated;
grant execute on function public.zhi_king_support_aitian_assess() to service_role;
