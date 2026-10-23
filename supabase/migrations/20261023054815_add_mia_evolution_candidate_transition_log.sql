create or replace function public.mia_evolution_log_candidate_transition()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare prev text; summary text; idem text;
begin
  if tg_op='INSERT' then
    prev := null;
    summary := 'Candidate created; source, evidence, privacy and conflict checks remain pending.';
    idem := 'candidate-created:' || new.candidate_id::text;
  else
    prev := old.state;
    if prev is not distinct from new.state then return new; end if;
    summary := coalesce(new.reviewer_decision, 'State transition requested; review evidence separately.');
    idem := 'state:' || new.candidate_id::text || ':' || prev || ':' || new.state || ':' ||
      floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
  end if;
  insert into public.mia_evolution_candidate_events
    (candidate_id, identity_id, from_state, to_state, actor, reason_code, reason_summary, idempotency_key)
  values (new.candidate_id, new.identity_id, prev, new.state, 'mia-evolution-pipeline',
    case when tg_op='INSERT' then 'candidate_created' else 'state_transition' end, summary, idem);
  return new;
end; $$;
create trigger mia_evolution_log_candidate_transition
after insert or update on public.mia_evolution_candidates
for each row execute function public.mia_evolution_log_candidate_transition();
revoke all on function public.mia_evolution_log_candidate_transition() from public, anon, authenticated;
