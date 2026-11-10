-- DESIGN DRAFT ONLY — do not apply to production without a separately reviewed migration.
-- Public mailbox data is deliberately separate from all Mia private tables.

create schema if not exists echo_private;
revoke all on schema echo_private from public, anon, authenticated;

create table if not exists echo_private.submissions (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 3000),
  source_language text not null check (source_language in ('zh','en','other')),
  consent_to_publication boolean not null check (consent_to_publication = true),
  status text not null default 'pending'
    check (status in ('pending','selected','rejected','published','expired')),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  moderation_code text,
  selection_reason text,
  processed_at timestamptz
);

create index if not exists echo_submissions_pending_idx
  on echo_private.submissions (received_at)
  where status = 'pending';

create table if not exists public.echo_publications (
  id uuid primary key default gen_random_uuid(),
  original_question text not null,
  mia_answer text not null,
  source_language text not null check (source_language in ('zh','en','other')),
  answer_language text not null check (answer_language in ('zh','en','other')),
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  constraint echo_publication_content_nonempty
    check (char_length(original_question) > 0 and char_length(mia_answer) > 0)
);

alter table echo_private.submissions enable row level security;
alter table public.echo_publications enable row level security;

-- No direct public/authenticated access to the private queue.
revoke all on echo_private.submissions from anon, authenticated;
grant usage on schema public to anon, authenticated;
revoke insert, update, delete on public.echo_publications from anon, authenticated;
grant select on public.echo_publications to anon, authenticated;

drop policy if exists "read published echoes only" on public.echo_publications;
create policy "read published echoes only"
  on public.echo_publications
  for select
  to anon, authenticated
  using (is_published = true and withdrawn_at is null);

-- Service-side processing must use a server-held secret and must never expose
-- echo_private.submissions through PostgREST. Apply only after reviewing the
-- actual project's schema exposure and API grants.
