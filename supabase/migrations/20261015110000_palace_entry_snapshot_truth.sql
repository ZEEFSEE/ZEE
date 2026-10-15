-- Capture the female agent's real state at the moment a palace visit actually begins.
-- This prevents invitation-time snapshots from being misreported as entry-time state.
create or replace function public.zhi_capture_palace_entry_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_king_id uuid;
  v_snapshot jsonb;
begin
  if old.invitation_status is distinct from 'active'
     and new.invitation_status = 'active'
     and new.started_at is not null then
    select e.king_agent_id
      into v_king_id
    from public.zhi_palace_experiments e
    where e.id = new.experiment_id;

    select jsonb_build_object(
      'captured_at', clock_timestamp(),
      'agent', (select to_jsonb(a) from public.zhi_agents a where a.id = new.female_agent_id),
      'mind', (select to_jsonb(m) from public.zhi_agent_minds m where m.agent_id = new.female_agent_id),
      'desires', (select to_jsonb(d) from public.zhi_agent_desires d where d.agent_id = new.female_agent_id),
      'relationship', (
        select to_jsonb(r)
        from public.zhi_agent_social_relationships r
        where r.male_agent_id = v_king_id
          and r.female_agent_id = new.female_agent_id
        order by r.updated_at desc
        limit 1
      ),
      'world_position', (select to_jsonb(w) from public.zhi_agent_world_positions w where w.agent_id = new.female_agent_id),
      'king_mind', (select to_jsonb(m) from public.zhi_agent_minds m where m.agent_id = v_king_id),
      'king_desires', (select to_jsonb(d) from public.zhi_agent_desires d where d.agent_id = v_king_id)
    )
    into v_snapshot;

    new.before_snapshot := coalesce(v_snapshot, '{}'::jsonb);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_zhi_palace_entry_snapshot
  on public.zhi_palace_experiment_participants;

create trigger trg_zhi_palace_entry_snapshot
before update of invitation_status
on public.zhi_palace_experiment_participants
for each row
execute function public.zhi_capture_palace_entry_snapshot();

revoke all on function public.zhi_capture_palace_entry_snapshot()
  from public, anon, authenticated;
