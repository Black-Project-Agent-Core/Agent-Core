create schema if not exists pgsodium;
create extension if not exists pgsodium with schema pgsodium;

create table if not exists agent_core_private.memory_auth_public_keys (
  mirror_id text primary key check (mirror_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  public_key bytea not null check (octet_length(public_key) = 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
revoke all on agent_core_private.memory_auth_public_keys from public, anon, authenticated;

-- Preserve the already-tested file-version implementation, but make its HMAC gate server-internal only.
do $$
begin
  if to_regprocedure('public.joe_memory_second_call(text,text,bigint,text,text)') is not null
     and to_regprocedure('public.joe_memory_second_call_hmac_internal(text,text,bigint,text,text)') is null then
    alter function public.joe_memory_second_call(text,text,bigint,text,text) rename to joe_memory_second_call_hmac_internal;
  end if;
end;
$$;
revoke all on function public.joe_memory_second_call_hmac_internal(text,text,bigint,text,text) from public, anon, authenticated;

create or replace function public.joe_memory_second_call(
  operation text,
  payload_text text,
  auth_ts bigint,
  auth_nonce text,
  auth_sig text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pgsodium, agent_core_private
as $$
declare
  payload jsonb;
  mirror text;
  public_key bytea;
  internal_secret bytea;
  internal_sig text;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if payload_text is null or octet_length(payload_text) < 2 or octet_length(payload_text) > 16777216 then
    raise exception 'MEMORY_SECOND_PAYLOAD_INVALID';
  end if;
  if auth_nonce is null or auth_nonce !~ '^[0-9a-f]{32}$' or auth_sig is null or auth_sig !~ '^[0-9a-fA-F]{128}$' then
    raise exception 'MEMORY_SECOND_AUTH_INVALID';
  end if;
  if abs(now_ms - auth_ts) > 300000 then
    raise exception 'MEMORY_SECOND_AUTH_EXPIRED';
  end if;
  begin
    payload := payload_text::jsonb;
  exception when others then
    raise exception 'MEMORY_SECOND_PAYLOAD_INVALID';
  end;
  mirror := payload->>'mirror_id';
  if mirror is null or mirror !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'MEMORY_SECOND_MIRROR_INVALID';
  end if;
  select k.public_key into public_key from agent_core_private.memory_auth_public_keys k where k.mirror_id = mirror;
  if public_key is null then raise exception 'MEMORY_SECOND_AUTH_UNPROVISIONED'; end if;
  if not pgsodium.crypto_sign_verify_detached(
    decode(auth_sig, 'hex'),
    convert_to(auth_ts::text || E'\n' || auth_nonce || E'\n' || payload_text, 'UTF8'),
    public_key
  ) then
    raise exception 'MEMORY_SECOND_AUTH_INVALID';
  end if;
  select s.auth_secret into internal_secret from agent_core_private.memory_auth_secrets s where s.mirror_id = mirror;
  if internal_secret is null then raise exception 'MEMORY_SECOND_AUTH_UNPROVISIONED'; end if;
  internal_sig := encode(extensions.hmac(
    convert_to(auth_ts::text || E'\n' || auth_nonce || E'\n' || payload_text, 'UTF8'),
    internal_secret,
    'sha256'
  ), 'hex');
  return public.joe_memory_second_call_hmac_internal(operation,payload_text,auth_ts,auth_nonce,internal_sig);
end;
$$;
revoke all on function public.joe_memory_second_call(text,text,bigint,text,text) from public;
grant execute on function public.joe_memory_second_call(text,text,bigint,text,text) to anon, authenticated;
