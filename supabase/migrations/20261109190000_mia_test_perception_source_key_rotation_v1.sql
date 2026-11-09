-- Add rotatable Ed25519 public keys without replacing existing source registry records.
create table if not exists mia_test.perception_source_keys (
  source_id uuid not null references mia_test.perception_source_registry(source_id),
  key_id text not null,
  algorithm text not null check (algorithm = 'ed25519'),
  public_key_b64url text not null check (length(public_key_b64url) between 40 and 64),
  enabled boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_id, key_id),
  check (valid_until is null or valid_until > valid_from),
  check (revoked_at is null or enabled is false)
);
alter table mia_test.perception_ingress_events
  add column if not exists key_id text,
  add column if not exists raw_payload_bytes bytea;
create unique index if not exists perception_ingress_source_event_unique
  on mia_test.perception_ingress_events(source_id, source_event_id);
-- Nonces are checked under an advisory transaction lock so replay attempts can themselves be audited.
drop index if exists mia_test.perception_ingress_source_nonce_unique;
alter table mia_test.perception_source_keys enable row level security;
revoke all on mia_test.perception_source_keys from public, anon, authenticated;
grant all on mia_test.perception_source_keys to service_role;
