-- Durable queue for Mia's non-blocking post-reply reflection.
-- This migration is additive; it does not alter existing chat or memory rows.
create table if not exists public.mia_reflection_queue (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null,
  task_type text not null check (task_type in ('emotion_reflection')),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  priority integer not null default 10,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 8),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists mia_reflection_queue_ready_idx
  on public.mia_reflection_queue (priority desc, available_at, created_at)
  where status = 'pending';

create index if not exists mia_reflection_queue_lease_idx
  on public.mia_reflection_queue (locked_at)
  where status = 'processing';

alter table public.mia_reflection_queue enable row level security;
revoke all on public.mia_reflection_queue from anon, authenticated;
grant all on public.mia_reflection_queue to service_role;

create or replace function public.claim_mia_reflection_tasks(p_limit integer default 5)
returns setof public.mia_reflection_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mia_reflection_queue
     set status = 'failed',
         last_error = coalesce(last_error, 'Worker lease expired after maximum attempts'),
         updated_at = now(),
         locked_at = null,
         lock_token = null
   where status = 'processing'
     and locked_at < now() - interval '3 minutes'
     and attempts >= max_attempts;

  return query
  with picked as (
    select q.id
      from public.mia_reflection_queue q
     where q.attempts < q.max_attempts
       and (
         (q.status = 'pending' and q.available_at <= now())
         or (q.status = 'processing' and q.locked_at < now() - interval '3 minutes')
       )
     order by q.priority desc, q.available_at asc, q.created_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 5), 10))
  )
  update public.mia_reflection_queue q
     set status = 'processing',
         attempts = q.attempts + 1,
         locked_at = now(),
         lock_token = gen_random_uuid(),
         updated_at = now(),
         last_error = null
    from picked
   where q.id = picked.id
  returning q.*;
end;
$$;

revoke all on function public.claim_mia_reflection_tasks(integer) from public, anon, authenticated;
grant execute on function public.claim_mia_reflection_tasks(integer) to service_role;
