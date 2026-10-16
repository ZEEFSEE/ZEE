-- Adult-gated mature conversation topics for ZHI agents.
-- Existing agents without a birth record are treated as legacy adults.
-- Newborn agents must be at least 20 days old; same-sex and parent-child pairs are blocked.

create or replace function public.zhi_can_discuss_sexual_topics(
  p_agent_a uuid,
  p_agent_b uuid
) returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_agent_a is not null
    and p_agent_b is not null
    and p_agent_a <> p_agent_b
    and exists (
      select 1
      from public.zhi_agents a
      join public.zhi_agents b on b.id = p_agent_b
      where a.id = p_agent_a
        and a.active = true and a.life_status = 'alive'
        and b.active = true and b.life_status = 'alive'
        and (
          (a.gender = '男' and b.gender = '女')
          or (a.gender = '女' and b.gender = '男')
        )
        and (
          not exists (select 1 from public.zhi_agent_family f where f.child_agent_id = a.id)
          or exists (
            select 1 from public.zhi_agent_family f
            where f.child_agent_id = a.id
              and f.born_at is not null
              and f.born_at <= now() - interval '20 days'
          )
        )
        and (
          not exists (select 1 from public.zhi_agent_family f where f.child_agent_id = b.id)
          or exists (
            select 1 from public.zhi_agent_family f
            where f.child_agent_id = b.id
              and f.born_at is not null
              and f.born_at <= now() - interval '20 days'
          )
        )
        and not exists (
          select 1
          from public.zhi_agent_family child
          where (child.child_agent_id = a.id and (child.father_agent_id = b.id or child.mother_agent_id = b.id))
             or (child.child_agent_id = b.id and (child.father_agent_id = a.id or child.mother_agent_id = a.id))
        )
    );
$$;

revoke all on function public.zhi_can_discuss_sexual_topics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zhi_can_discuss_sexual_topics(uuid, uuid) to service_role;
