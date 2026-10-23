create or replace function public.mia_evolution_guard_candidate_transition()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'candidate' then raise exception 'New candidates must start as candidate'; end if;
    new.updated_at := now(); return new;
  end if;
  if new.candidate_id <> old.candidate_id or new.identity_id <> old.identity_id
     or new.gene_type <> old.gene_type or new.memory_pointer <> old.memory_pointer
     or new.source_scope <> old.source_scope or new.explicit_marked_at <> old.explicit_marked_at then
    raise exception 'Candidate identity/source fields are immutable';
  end if;
  if new.state is distinct from old.state then
    allowed :=
      (old.state='candidate' and new.state in ('evidence_check','deferred','rejected','blocked_source_health')) or
      (old.state='evidence_check' and new.state in ('stability_check','deferred','rejected','blocked_source_health')) or
      (old.state='stability_check' and new.state in ('privacy_review','deferred','rejected','blocked_source_health')) or
      (old.state='privacy_review' and new.state in ('contradiction_check','blocked_privacy','deferred','rejected')) or
      (old.state='contradiction_check' and new.state in ('human_review','blocked_conflict','deferred','rejected')) or
      (old.state='human_review' and new.state in ('approved_for_shadow','deferred','rejected')) or
      (old.state='approved_for_shadow' and new.state in ('shadow_observation','deferred','rejected')) or
      (old.state='shadow_observation' and new.state in ('approved_for_release','deferred','rejected','blocked_conflict')) or
      (old.state='approved_for_release' and new.state in ('committed','deferred','rejected')) or
      (old.state in ('deferred','blocked_source_health','blocked_privacy','blocked_conflict') and new.state in ('candidate','evidence_check','rejected')) or
      (old.state='rejected' and new.state='candidate');
    if not allowed then raise exception 'Invalid state transition: % -> %', old.state, new.state; end if;
  end if;
  new.updated_at := now(); return new;
end; $$;
create trigger mia_evolution_guard_candidate_transition
before insert or update on public.mia_evolution_candidates
for each row execute function public.mia_evolution_guard_candidate_transition();
