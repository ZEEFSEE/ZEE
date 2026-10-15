-- KING universal support decision engine.
-- This creates evidence-based offers for any living agent with observable distress.
-- It does NOT decide for recipients, fabricate interactions, or alter mood/stress.

alter table public.zhi_agent_support_cases
  drop constraint if exists zhi_agent_support_cases_status_check;

alter table public.zhi_agent_support_cases
  add constraint zhi_agent_support_cases_status_check
  check (status in (
    'deferred_by_helper',
    'recipient_declined',
    'recipient_deferred',
    'executed_pending_outcome',
    'evaluated',
    'pending_recipient_response'
  ));

create index if not exists zhi_agent_support_cases_pair_recent_idx
  on public.zhi_agent_support_cases
    (helper_agent_id, recipient_agent_id, created_at desc);

create or replace function public.zhi_king_support_all_agents_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  king_id uuid := '0a96754c-7232-4531-890b-e3648b63f887';
  king_m record;
  target record;
  rel record;
  social_frustration_count integer;
  emotion_signal_count integer;
  work_failure_count integer;
  evidence_snapshot jsonb;
  king_snapshot jsonb;
  recipient_snapshot jsonb;
  relationship_snapshot jsonb;
  hypothesis text;
  help_choice text;
  rationale text;
  case_id uuid;
  created_count integer := 0;
  skipped_count integer := 0;
  offers jsonb := '[]'::jsonb;
begin
  select * into king_m
  from public.zhi_agent_minds
  where agent_id = king_id;

  if king_m.agent_id is null then
    return jsonb_build_object('ok', false, 'reason', 'king_mind_missing');
  end if;

  king_snapshot := jsonb_build_object(
    'mood', king_m.mood, 'energy', king_m.energy, 'stress', king_m.stress,
    'curiosity', king_m.curiosity, 'confidence', king_m.confidence,
    'goal', king_m.current_goal, 'thought', king_m.last_thought,
    'captured_at', clock_timestamp()
  );

  for target in
    select a.id, a.name, a.gender, m.mood, m.energy, m.stress,
           m.curiosity, m.confidence, m.current_goal, m.short_term_goal,
           m.last_thought
    from public.zhi_agents a
    join public.zhi_agent_minds m on m.agent_id = a.id
    where a.id <> king_id
      and a.active = true
      and a.life_status = 'alive'
    order by
      case when coalesce(m.stress, 0) >= 90 then 0
           when coalesce(m.mood, 100) <= 15 then 1 else 2 end,
      coalesce(m.stress, 0) desc
  loop
    select count(*) into social_frustration_count
    from public.zhi_agent_desire_outcomes
    where agent_id = target.id
      and desire_type = 'socialize'
      and outcome = 'frustrated'
      and created_at > clock_timestamp() - interval '48 hours';

    select count(*) into emotion_signal_count
    from public.zhi_agent_emotion_events
    where agent_id = target.id
      and occurred_at > clock_timestamp() - interval '48 hours'
      and (
        cause ilike '%没有获得回应%'
        or cause ilike '%社交%'
        or cause ilike '%关系%'
        or cause ilike '%孤独%'
      );

    select count(*) into work_failure_count
    from public.zhi_agent_desire_outcomes
    where agent_id = target.id
      and desire_type = 'work'
      and outcome in ('frustrated', 'failed')
      and created_at > clock_timestamp() - interval '72 hours';

    -- No offer unless current state or recorded events show a plausible need.
    if coalesce(target.stress, 0) < 75
       and coalesce(target.mood, 100) > 25
       and social_frustration_count = 0
       and emotion_signal_count = 0
       and work_failure_count = 0 then
      continue;
    end if;

    -- One open/recent case per KING-recipient pair, to avoid repeated pressure.
    if exists (
      select 1
      from public.zhi_agent_support_cases c
      where c.helper_agent_id = king_id
        and c.recipient_agent_id = target.id
        and c.status in (
          'pending_recipient_response', 'recipient_declined',
          'recipient_deferred', 'executed_pending_outcome'
        )
        and c.created_at > clock_timestamp() - interval '24 hours'
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select * into rel
    from public.zhi_agent_social_relationships
    where (male_agent_id = king_id and female_agent_id = target.id)
       or (female_agent_id = king_id and male_agent_id = target.id)
    order by updated_at desc
    limit 1;

    if social_frustration_count > 0 or emotion_signal_count > 0 then
      hypothesis := 'social_or_relationship_strain';
      help_choice := 'non_romantic_check_in';
      rationale := '重复社交挫败或关系相关情绪事件提供了线索；先询问对方希望获得何种支持，不推断具体责任人。';
    elsif work_failure_count > 0 then
      hypothesis := 'work_difficulty';
      help_choice := 'offer_practical_work_support';
      rationale := '近期工作目标出现挫败/失败记录；先询问是否愿意接受工作或日程方面的实际协助。';
    elsif coalesce(target.stress, 0) >= 90 or coalesce(target.mood, 100) <= 15 then
      hypothesis := 'high_stress_or_low_mood';
      help_choice := 'ask_preferred_support';
      rationale := '状态指标明显异常但根因尚不充分；先询问对方希望获得何种支持，不作诊断。';
    else
      hypothesis := 'possible_support_need';
      help_choice := 'ask_preferred_support';
      rationale := '检测到可能需要支持的迹象；先征求对方意愿，再决定是否行动。';
    end if;

    evidence_snapshot := jsonb_build_object(
      'stress', target.stress, 'mood', target.mood,
      'energy', target.energy, 'confidence', target.confidence,
      'social_frustrated_48h', social_frustration_count,
      'emotion_signals_48h', emotion_signal_count,
      'work_failures_72h', work_failure_count,
      'cause_hypothesis', hypothesis,
      'captured_at', clock_timestamp()
    );

    recipient_snapshot := jsonb_build_object(
      'mood', target.mood, 'energy', target.energy,
      'stress', target.stress, 'curiosity', target.curiosity,
      'confidence', target.confidence, 'goal', target.current_goal,
      'short_term_goal', target.short_term_goal,
      'thought', target.last_thought, 'captured_at', clock_timestamp()
    );

    relationship_snapshot := jsonb_build_object(
      'familiarity', coalesce(rel.familiarity, 0),
      'affection', coalesce(rel.affection, 0),
      'trust', coalesce(rel.trust, 0),
      'conflict', coalesce(rel.conflict, 0),
      'interactions', coalesce(rel.interactions, 0),
      'status', rel.status,
      'relationship_stage', rel.relationship_stage
    );

    insert into public.zhi_agent_support_cases (
      helper_agent_id, recipient_agent_id, case_type, evidence,
      helper_state_before, recipient_state_before, relationship_snapshot,
      helper_decision, help_type, helper_reason,
      recipient_response, recipient_reason, status
    ) values (
      king_id, target.id, hypothesis, evidence_snapshot,
      king_snapshot, recipient_snapshot, relationship_snapshot,
      'offer_support', help_choice, rationale,
      'pending',
      '等待该智能人的独立决策机制接受、拒绝或暂缓；KING 不代替对方决定。',
      'pending_recipient_response'
    ) returning id into case_id;

    insert into public.zhi_agent_life_timeline (
      agent_id, occurred_at, life_event_type, activity_type,
      location_name, reason
    ) values (
      king_id, clock_timestamp(), 'support_offer_decision',
      'support_assessment', 'support_review',
      'KING 根据可核验状态与事件证据评估并提出支持选项；目标='
        || target.name || '；类型=' || help_choice
        || '；尚未视为对方接受或实际帮助已执行。'
    );

    created_count := created_count + 1;
    offers := offers || jsonb_build_array(jsonb_build_object(
      'case_id', case_id, 'recipient_id', target.id,
      'recipient_name', target.name, 'cause_hypothesis', hypothesis,
      'help_type', help_choice, 'status', 'pending_recipient_response'
    ));
  end loop;

  return jsonb_build_object(
    'ok', true, 'king_state', king_snapshot,
    'offers_created', created_count, 'recent_cases_skipped', skipped_count,
    'offers', offers,
    'safety', 'Recipient consent and actual interactions must be recorded by the recipient/interaction engine. This function does not alter agent emotions or state.'
  );
end;
$function$;

revoke all on function public.zhi_king_support_all_agents_tick()
  from public, anon, authenticated;
grant execute on function public.zhi_king_support_all_agents_tick()
  to service_role;
