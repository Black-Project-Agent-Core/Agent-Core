create extension if not exists pgcrypto with schema extensions;
create schema if not exists agent_core_private;
revoke all on schema agent_core_private from public;
revoke all on schema agent_core_private from anon, authenticated;

create table if not exists agent_core_private.memory_auth_secrets (
  mirror_id text primary key check (mirror_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  auth_secret bytea not null check (octet_length(auth_secret) >= 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
create table if not exists agent_core_private.memory_auth_nonces (
  mirror_id text not null,
  nonce text not null check (nonce ~ '^[0-9a-f]{32}$'),
  expires_at timestamptz not null,
  primary key (mirror_id, nonce)
);
create index if not exists memory_auth_nonces_expiry_idx on agent_core_private.memory_auth_nonces(expires_at);

create table if not exists agent_core_private.memory_file_versions (
  principal_id text not null,
  project_id text not null default '',
  mirror_id text not null,
  file_id text not null,
  version_id text not null,
  relative_path text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  encrypted_envelope jsonb not null,
  created_at bigint not null,
  primary key (principal_id, project_id, mirror_id, file_id, version_id)
);
create index if not exists memory_file_versions_file_idx on agent_core_private.memory_file_versions(principal_id, project_id, mirror_id, file_id, created_at desc);

create table if not exists agent_core_private.memory_files (
  principal_id text not null,
  project_id text not null default '',
  mirror_id text not null,
  file_id text not null,
  relative_path text not null,
  current_version_id text not null,
  prior_version_id text,
  state text not null check (state in ('active','tombstoned')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  updated_at bigint not null,
  primary key (principal_id, project_id, mirror_id, file_id)
);
create unique index if not exists memory_files_path_idx on agent_core_private.memory_files(principal_id, project_id, mirror_id, relative_path);

create table if not exists agent_core_private.memory_tombstones (
  tombstone_id uuid primary key default gen_random_uuid(),
  principal_id text not null,
  project_id text not null default '',
  mirror_id text not null,
  file_id text not null,
  relative_path text not null,
  prior_version_id text not null,
  reason_hash text not null check (reason_hash ~ '^[0-9a-f]{64}$'),
  deleted_at bigint not null,
  retention_until bigint not null check (retention_until > deleted_at)
);
create index if not exists memory_tombstones_file_idx on agent_core_private.memory_tombstones(principal_id, project_id, mirror_id, file_id, deleted_at desc);

create table if not exists agent_core_private.memory_sync_state (
  principal_id text not null,
  project_id text not null default '',
  mirror_id text not null,
  last_version_id text,
  logical_root_hash text,
  updated_at bigint not null,
  primary key (principal_id, project_id, mirror_id)
);

revoke all on all tables in schema agent_core_private from public, anon, authenticated;
revoke all on all sequences in schema agent_core_private from public, anon, authenticated;

create or replace function public.joe_memory_second_call(
  operation text,
  payload_text text,
  auth_ts bigint,
  auth_nonce text,
  auth_sig text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, agent_core_private
as $$
declare
  payload jsonb;
  mirror text;
  secret bytea;
  expected_sig text;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  principal text;
  project text;
  fid text;
  relpath text;
  incoming_updated bigint;
  vid text;
  chash text;
  version_payload jsonb;
  head_row agent_core_private.memory_files%rowtype;
  version_row agent_core_private.memory_file_versions%rowtype;
begin
  if operation not in ('append_version','tombstone','get_head','get_version','upsert_sync_state') then
    raise exception 'MEMORY_SECOND_OPERATION_INVALID';
  end if;
  if payload_text is null or octet_length(payload_text) < 2 or octet_length(payload_text) > 16777216 then
    raise exception 'MEMORY_SECOND_PAYLOAD_INVALID';
  end if;
  if auth_nonce is null or auth_nonce !~ '^[0-9a-f]{32}$' or auth_sig is null or auth_sig !~ '^[0-9a-fA-F]{64}$' then
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
  if mirror is null or mirror !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception 'MEMORY_SECOND_MIRROR_INVALID'; end if;
  select auth_secret into secret from agent_core_private.memory_auth_secrets where mirror_id = mirror;
  if secret is null then raise exception 'MEMORY_SECOND_AUTH_UNPROVISIONED'; end if;
  expected_sig := encode(extensions.hmac(convert_to(auth_ts::text || E'\n' || auth_nonce || E'\n' || payload_text, 'UTF8'), secret, 'sha256'), 'hex');
  if expected_sig <> lower(auth_sig) then raise exception 'MEMORY_SECOND_AUTH_INVALID'; end if;
  delete from agent_core_private.memory_auth_nonces where expires_at < clock_timestamp();
  begin
    insert into agent_core_private.memory_auth_nonces(mirror_id, nonce, expires_at) values (mirror, auth_nonce, clock_timestamp() + interval '10 minutes');
  exception when unique_violation then
    raise exception 'MEMORY_SECOND_AUTH_REPLAY';
  end;

  principal := payload->>'principal_id'; project := coalesce(payload->>'project_id',''); fid := payload->>'file_id';
  if principal is null or length(principal) < 1 or length(principal) > 512 or length(project) > 2048 or (operation <> 'upsert_sync_state' and (fid is null or length(fid) < 1 or length(fid) > 512)) then
    raise exception 'MEMORY_SECOND_IDENTITY_INVALID';
  end if;

  if operation = 'append_version' then
    relpath := payload->>'relative_path'; incoming_updated := (payload->>'updated_at')::bigint; version_payload := payload->'version';
    vid := version_payload->>'version_id'; chash := version_payload->>'content_hash';
    if relpath is null or length(relpath)>2048 or relpath like '/%' or relpath ~ '(^|/)\.\.(/|$)' or vid is null or length(vid)>256 or chash !~ '^[0-9a-f]{64}$' then raise exception 'MEMORY_SECOND_VERSION_INVALID'; end if;
    if version_payload->'encrypted_envelope'->>'plaintextHash' <> chash then raise exception 'MEMORY_SECOND_HASH_MISMATCH'; end if;
    select * into version_row from agent_core_private.memory_file_versions where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid and version_id=vid;
    if found then
      if version_row.content_hash<>chash or version_row.relative_path<>relpath or version_row.encrypted_envelope<>version_payload->'encrypted_envelope' then raise exception 'MEMORY_SECOND_VERSION_CONFLICT'; end if;
    else
      insert into agent_core_private.memory_file_versions(principal_id,project_id,mirror_id,file_id,version_id,relative_path,content_hash,encrypted_envelope,created_at)
      values(principal,project,mirror,fid,vid,relpath,chash,version_payload->'encrypted_envelope',(version_payload->>'created_at')::bigint);
    end if;
    select * into head_row from agent_core_private.memory_files where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid for update;
    if found then
      if incoming_updated < head_row.updated_at and head_row.current_version_id<>vid then raise exception 'MEMORY_SECOND_STALE_WRITE'; end if;
      if head_row.current_version_id=vid and head_row.state='active' then return jsonb_build_object('applied',false,'current_version_id',vid); end if;
      update agent_core_private.memory_files set relative_path=relpath,current_version_id=vid,prior_version_id=null,state='active',content_hash=chash,updated_at=incoming_updated where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid;
    else
      insert into agent_core_private.memory_files(principal_id,project_id,mirror_id,file_id,relative_path,current_version_id,state,content_hash,updated_at) values(principal,project,mirror,fid,relpath,vid,'active',chash,incoming_updated);
    end if;
    return jsonb_build_object('applied',true,'current_version_id',vid);
  elsif operation = 'tombstone' then
    relpath:=payload->>'relative_path';incoming_updated:=(payload->>'deleted_at')::bigint;
    select * into head_row from agent_core_private.memory_files where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid for update;
    if not found then raise exception 'MEMORY_SECOND_HEAD_MISSING'; end if;
    if incoming_updated < head_row.updated_at then raise exception 'MEMORY_SECOND_STALE_WRITE'; end if;
    insert into agent_core_private.memory_tombstones(principal_id,project_id,mirror_id,file_id,relative_path,prior_version_id,reason_hash,deleted_at,retention_until)
    values(principal,project,mirror,fid,relpath,head_row.current_version_id,payload->>'reason_hash',incoming_updated,(payload->>'retention_until')::bigint);
    update agent_core_private.memory_files set state='tombstoned',prior_version_id=head_row.current_version_id,updated_at=incoming_updated where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid;
    return jsonb_build_object('tombstoned',true,'prior_version_id',head_row.current_version_id);
  elsif operation = 'get_head' then
    select * into head_row from agent_core_private.memory_files where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid;
    if not found then return 'null'::jsonb; end if;
    return jsonb_build_object('principal_id',head_row.principal_id,'project_id',head_row.project_id,'mirror_id',head_row.mirror_id,'file_id',head_row.file_id,'relative_path',head_row.relative_path,'current_version_id',head_row.current_version_id,'prior_version_id',head_row.prior_version_id,'state',head_row.state,'content_hash',head_row.content_hash,'updated_at',head_row.updated_at);
  elsif operation = 'get_version' then
    vid:=payload->>'version_id';
    select * into version_row from agent_core_private.memory_file_versions where principal_id=principal and project_id=project and mirror_id=mirror and file_id=fid and version_id=vid;
    if not found then return 'null'::jsonb; end if;
    return jsonb_build_object('version_id',version_row.version_id,'file_id',version_row.file_id,'relative_path',version_row.relative_path,'content_hash',version_row.content_hash,'encrypted_envelope',version_row.encrypted_envelope,'created_at',version_row.created_at);
  else
    insert into agent_core_private.memory_sync_state(principal_id,project_id,mirror_id,last_version_id,logical_root_hash,updated_at)
    values(principal,project,mirror,payload->>'last_version_id',payload->>'logical_root_hash',(payload->>'updated_at')::bigint)
    on conflict(principal_id,project_id,mirror_id) do update set last_version_id=excluded.last_version_id,logical_root_hash=excluded.logical_root_hash,updated_at=excluded.updated_at
      where excluded.updated_at >= agent_core_private.memory_sync_state.updated_at;
    return jsonb_build_object('updated',true);
  end if;
end;
$$;
revoke all on function public.joe_memory_second_call(text,text,bigint,text,text) from public;
grant execute on function public.joe_memory_second_call(text,text,bigint,text,text) to anon, authenticated;

