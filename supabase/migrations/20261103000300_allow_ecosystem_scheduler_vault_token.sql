create or replace function public.zhi_ecosystem_scheduler_token_matches(p_token text)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    p_token is not null
    and length(p_token) between 32 and 4096
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'zhi_ecosystem_aurora_scheduler_token'
        and decrypted_secret = p_token
    ),
    false
  );
$$;

revoke all on function public.zhi_ecosystem_scheduler_token_matches(text) from public;
revoke all on function public.zhi_ecosystem_scheduler_token_matches(text) from anon;
revoke all on function public.zhi_ecosystem_scheduler_token_matches(text) from authenticated;
grant execute on function public.zhi_ecosystem_scheduler_token_matches(text) to service_role;
