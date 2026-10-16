-- Chat password verifier and throttling. The bcrypt password row is provisioned out-of-band;
-- do not store the plaintext page password or its hash in the public repository.
create table if not exists public.zhi_chat_auth_config (
  singleton boolean primary key default true check (singleton),
  password_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on table public.zhi_chat_auth_config from public, anon, authenticated;

create table if not exists public.zhi_chat_auth_attempts (
  client_key text primary key,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);
revoke all on table public.zhi_chat_auth_attempts from public, anon, authenticated;

create or replace function public.zhi_verify_chat_password(p_password text, p_client_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_attempt public.zhi_chat_auth_attempts%rowtype;
  v_key text := left(coalesce(nullif(p_client_key, ''), 'unknown'), 128);
begin
  perform pg_advisory_xact_lock(hashtext(v_key));
  select * into v_attempt from public.zhi_chat_auth_attempts where client_key = v_key;
  if v_attempt.blocked_until is not null and v_attempt.blocked_until > now() then
    return false;
  end if;

  select password_hash into v_hash from public.zhi_chat_auth_config where singleton = true;
  if v_hash is null then raise exception 'Chat password is not configured'; end if;

  if p_password is not null and extensions.crypt(p_password, v_hash) = v_hash then
    insert into public.zhi_chat_auth_attempts(client_key, failed_count, window_started_at, blocked_until)
    values (v_key, 0, now(), null)
    on conflict (client_key) do update
      set failed_count = 0, window_started_at = now(), blocked_until = null;
    return true;
  end if;

  if v_attempt.client_key is null or v_attempt.window_started_at < now() - interval '15 minutes' then
    insert into public.zhi_chat_auth_attempts(client_key, failed_count, window_started_at, blocked_until)
    values (v_key, 1, now(), null)
    on conflict (client_key) do update
      set failed_count = 1, window_started_at = now(), blocked_until = null;
  else
    update public.zhi_chat_auth_attempts
      set failed_count = v_attempt.failed_count + 1,
          blocked_until = case when v_attempt.failed_count + 1 >= 5 then now() + interval '15 minutes' else null end
      where client_key = v_key;
  end if;
  return false;
end;
$$;

revoke all on function public.zhi_verify_chat_password(text, text) from public, anon, authenticated;
grant execute on function public.zhi_verify_chat_password(text, text) to service_role;
