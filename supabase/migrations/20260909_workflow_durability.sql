-- Scoped task durability. Source bytes and authorization leases are not projected.
begin;
create table if not exists public.agent_core_workflow_records (
  principal_id text not null, project_id text not null,
  category text not null, record_id text not null,
  record_version bigint not null check (record_version >= 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  document jsonb not null, serialized_document text not null,
  version_token uuid not null default gen_random_uuid(), synced_at timestamptz not null default now(),
  primary key (principal_id, project_id, category, record_id),
  check (length(principal_id) between 1 and 1000 and length(project_id) <= 4096),
  check (category in ('continuity-tasks','continuity-turns','continuity-checkpoints','continuity-frontier','write-decisions','lifecycles','workflow-contracts')),
  check (record_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  check (octet_length(serialized_document) <= 2097152),
  check (serialized_document::jsonb = document),
  check (encode(sha256(convert_to(serialized_document, 'UTF8')), 'hex') = content_hash)
);
create table if not exists public.agent_core_workflow_versions (
  principal_id text not null, project_id text not null, category text not null, record_id text not null,
  content_hash text not null, record_version bigint not null,
  document jsonb not null, serialized_document text not null, created_at timestamptz not null default now(),
  primary key (principal_id, project_id, category, record_id, content_hash),
  check (record_version >= 0 and content_hash ~ '^[a-f0-9]{64}$'),
  check (octet_length(serialized_document) <= 2097152 and serialized_document::jsonb = document),
  check (encode(sha256(convert_to(serialized_document, 'UTF8')), 'hex') = content_hash)
);
create table if not exists public.agent_core_workflow_generations (
  principal_id text not null, project_id text not null,
  generation_id text not null check (generation_id ~ '^[a-f0-9]{64}$'),
  manifest jsonb not null, serialized_manifest text not null,
  created_at timestamptz not null default now(),
  primary key (principal_id, project_id, generation_id),
  check (octet_length(serialized_manifest) <= 2097152 and serialized_manifest::jsonb = manifest),
  check (encode(sha256(convert_to(serialized_manifest, 'UTF8')), 'hex') = generation_id)
);
create table if not exists public.agent_core_workflow_heads (
  principal_id text not null, project_id text not null, generation_id text not null,
  version_token uuid not null default gen_random_uuid(), updated_at timestamptz not null default now(),
  primary key (principal_id, project_id),
  foreign key (principal_id, project_id, generation_id)
    references public.agent_core_workflow_generations(principal_id, project_id, generation_id)
);
create table if not exists public.agent_core_workflow_memory_versions (
  principal_id text not null, project_id text not null, memory_id uuid not null,
  content_hash text not null, document jsonb not null, serialized_document text not null,
  created_at timestamptz not null default now(),
  primary key (principal_id,project_id,memory_id,content_hash),
  check (content_hash ~ '^[a-f0-9]{64}$' and octet_length(serialized_document) <= 2097152),
  check (serialized_document::jsonb = document),
  check (encode(sha256(convert_to(serialized_document,'UTF8')),'hex') = content_hash)
);
alter table public.agent_core_workflow_records enable row level security;
alter table public.agent_core_workflow_versions enable row level security;
alter table public.agent_core_workflow_generations enable row level security;
alter table public.agent_core_workflow_heads enable row level security;
alter table public.agent_core_workflow_memory_versions enable row level security;
revoke all on table public.agent_core_workflow_records, public.agent_core_workflow_versions,
  public.agent_core_workflow_generations, public.agent_core_workflow_heads, public.agent_core_workflow_memory_versions from public, anon, authenticated;
grant select, insert, update on table public.agent_core_workflow_records, public.agent_core_workflow_heads to service_role;
grant select, insert on table public.agent_core_workflow_versions, public.agent_core_workflow_generations, public.agent_core_workflow_memory_versions to service_role;

-- Preserve the memory-only RPC without duplicating its implementation. Reapplying is safe.
do $block$
begin
  if to_regprocedure('public.agent_core_memory_base_call(text,jsonb)') is null then
    alter function public.agent_core_memory_call(text,jsonb) rename to agent_core_memory_base_call;
  end if;
end;
$block$;

create or replace function public.agent_core_memory_call(operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $function$
declare
  principal text := payload->>'principalId';
  project text := payload->>'projectId';
  kind text := payload->>'category';
  identifier text := payload->>'recordId';
  incoming_hash text := payload->>'contentHash';
  incoming_version bigint;
  doc jsonb; serialized text;
  old_doc jsonb; old_hash text; old_version bigint; old_token uuid; new_token uuid;
  manifest jsonb; generation text; current_generation text; expected_token uuid;
  item jsonb; result jsonb;
begin
  if operation = 'health' then
    perform 1 from public.agent_core_workflow_records limit 1;
    perform 1 from public.agent_core_workflow_versions limit 1;
    perform 1 from public.agent_core_workflow_generations limit 1;
    perform 1 from public.agent_core_workflow_heads limit 1;
    perform 1 from public.agent_core_workflow_memory_versions limit 1;
    return public.agent_core_memory_base_call(operation, payload) || jsonb_build_object('workflowSchemaVersion', 1);
  end if;
  if operation not in ('workflow_upsert','workflow_get','workflow_list','workflow_commit_generation','workflow_generation_get','workflow_memory_upsert','workflow_memory_get') then
    return public.agent_core_memory_base_call(operation, payload);
  end if;
  if coalesce(btrim(principal), '') = '' or length(principal) > 1000 or project is null or length(project) > 4096 then
    raise exception 'MEMORY_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if operation in ('workflow_upsert','workflow_get') and
    (kind is null or kind not in ('continuity-tasks','continuity-turns','continuity-checkpoints','continuity-frontier','write-decisions','lifecycles','workflow-contracts')
     or identifier is null or identifier !~ '^[A-Za-z0-9._-]{1,128}$') then
    raise exception 'WORKFLOW_RECORD_INVALID' using errcode = '22023';
  end if;
  if operation = 'workflow_memory_upsert' then
    doc := payload->'document'; serialized := payload->>'serializedDocument';
    if jsonb_typeof(doc) is distinct from 'object' or serialized is null
      or incoming_hash is null or incoming_hash !~ '^[a-f0-9]{64}$'
      or doc->>'principalId' is distinct from principal or coalesce(doc->>'projectId','') is distinct from project
      or doc #>> '{entry,memoryId}' is distinct from payload->>'memoryId'
      or octet_length(serialized) > 2097152 or serialized::jsonb <> doc
      or encode(sha256(convert_to(serialized,'UTF8')),'hex') <> incoming_hash then
      raise exception 'WORKFLOW_MEMORY_INVALID' using errcode = '22023';
    end if;
    perform 1 from public.agent_core_memory_records where principal_id = principal and project_id = project
      and memory_id = (payload->>'memoryId')::uuid and document = doc;
    if not found then raise exception 'WORKFLOW_MEMORY_UNSYNCED' using errcode = '23505'; end if;
    insert into public.agent_core_workflow_memory_versions(principal_id,project_id,memory_id,content_hash,document,serialized_document)
      values(principal,project,(payload->>'memoryId')::uuid,incoming_hash,doc,serialized)
      on conflict(principal_id,project_id,memory_id,content_hash) do nothing;
    return jsonb_build_object('applied',true,'contentHash',incoming_hash);
  elsif operation = 'workflow_memory_get' then
    select v.document into result from public.agent_core_workflow_memory_versions v where v.principal_id = principal and v.project_id = project
      and v.memory_id = (payload->>'memoryId')::uuid and v.content_hash = incoming_hash;
    return result;
  elsif operation = 'workflow_upsert' then
    doc := payload->'document'; serialized := payload->>'serializedDocument';
    incoming_version := (payload->>'recordVersion')::bigint;
    if jsonb_typeof(doc) is distinct from 'object' or serialized is null or incoming_version is null or incoming_version < 0
      or incoming_hash is null or incoming_hash !~ '^[a-f0-9]{64}$'
      or doc->>'principalId' is distinct from principal or coalesce(doc->>'projectId','') is distinct from project
      or octet_length(serialized) > 2097152 or serialized::jsonb <> doc
      or encode(sha256(convert_to(serialized,'UTF8')),'hex') <> incoming_hash then
      raise exception 'WORKFLOW_RECORD_INVALID' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('workflow' || chr(10) || principal || chr(10) || project, 0));
    select document, content_hash, record_version, version_token into old_doc, old_hash, old_version, old_token
      from public.agent_core_workflow_records
      where principal_id = principal and project_id = project and category = kind and record_id = identifier for update;
    if old_hash = incoming_hash and old_doc = doc and old_version = incoming_version then
      return jsonb_build_object('applied',true,'version',old_token,'contentHash',incoming_hash);
    end if;
    expected_token := (payload->>'expectedVersion')::uuid;
    if old_token is distinct from expected_token or old_version > incoming_version
      or (kind = 'workflow-contracts' and old_version = incoming_version) then
      raise exception 'WORKFLOW_WRITE_CONFLICT' using errcode = '23505';
    end if;
    insert into public.agent_core_workflow_versions(principal_id,project_id,category,record_id,content_hash,record_version,document,serialized_document)
      values(principal,project,kind,identifier,incoming_hash,incoming_version,doc,serialized)
      on conflict(principal_id,project_id,category,record_id,content_hash) do nothing;
    insert into public.agent_core_workflow_records(principal_id,project_id,category,record_id,content_hash,record_version,document,serialized_document)
      values(principal,project,kind,identifier,incoming_hash,incoming_version,doc,serialized)
      on conflict(principal_id,project_id,category,record_id) do update
        set content_hash = excluded.content_hash, record_version = excluded.record_version,
          document = excluded.document, serialized_document = excluded.serialized_document,
          version_token = gen_random_uuid(), synced_at = now()
      returning version_token into new_token;
    return jsonb_build_object('applied',true,'version',new_token,'contentHash',incoming_hash);
  elsif operation = 'workflow_get' then
    if payload->>'contentHash' is not null then
      select jsonb_build_object('principalId',principal_id,'projectId',project_id,'category',category,'recordId',record_id,
        'recordVersion',record_version,'contentHash',content_hash,'document',document) into result
        from public.agent_core_workflow_versions
        where principal_id = principal and project_id = project and category = kind and record_id = identifier
          and content_hash = payload->>'contentHash';
    else
      select jsonb_build_object('principalId',principal_id,'projectId',project_id,'category',category,'recordId',record_id,
        'recordVersion',record_version,'contentHash',content_hash,'document',document,'version',version_token) into result
        from public.agent_core_workflow_records
        where principal_id = principal and project_id = project and category = kind and record_id = identifier;
    end if;
    return result;
  elsif operation = 'workflow_commit_generation' then
    manifest := payload->'manifest'; serialized := payload->>'serializedManifest'; generation := payload->>'generationId';
    if jsonb_typeof(manifest) is distinct from 'object' or manifest->>'schemaVersion' is distinct from '1'
      or manifest->>'principalId' is distinct from principal or manifest->>'projectId' is distinct from project
      or jsonb_typeof(manifest->'records') is distinct from 'array' or jsonb_array_length(manifest->'records') > 10000
      or generation is null or generation !~ '^[a-f0-9]{64}$' or serialized is null or octet_length(serialized) > 2097152
      or serialized::jsonb <> manifest or encode(sha256(convert_to(serialized,'UTF8')),'hex') <> generation then
      raise exception 'WORKFLOW_GENERATION_INVALID' using errcode = '22023';
    end if;
    if manifest ? 'memories' and (jsonb_typeof(manifest->'memories') is distinct from 'array' or jsonb_array_length(manifest->'memories') > 10000) then
      raise exception 'WORKFLOW_GENERATION_INVALID' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('workflow' || chr(10) || principal || chr(10) || project, 0));
    -- Lock the semantic writer scope through the same boundary so a commit cannot mix memory revisions.
    perform pg_advisory_xact_lock(hashtextextended(principal || chr(10) || project, 0));
    select generation_id,version_token into current_generation,old_token from public.agent_core_workflow_heads
      where principal_id = principal and project_id = project for update;
    if current_generation is distinct from generation and old_token is distinct from (payload->>'expectedVersion')::uuid then
      raise exception 'WORKFLOW_GENERATION_CONFLICT' using errcode = '23505';
    end if;
    if (select count(*) from jsonb_array_elements(manifest->'records')) <>
      (select count(distinct (e->>'category',e->>'recordId')) from jsonb_array_elements(manifest->'records') e) then
      raise exception 'WORKFLOW_GENERATION_DUPLICATE' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(manifest->'records') loop
      perform 1 from public.agent_core_workflow_records where principal_id = principal and project_id = project
        and category = item->>'category' and record_id = item->>'recordId'
        and content_hash = item->>'contentHash' and record_version = (item->>'recordVersion')::bigint;
      if not found then raise exception 'WORKFLOW_GENERATION_INCOMPLETE' using errcode = '23505'; end if;
    end loop;
    if (select count(*) from public.agent_core_workflow_records where principal_id = principal and project_id = project)
      <> jsonb_array_length(manifest->'records') then
      raise exception 'WORKFLOW_GENERATION_INCOMPLETE' using errcode = '23505';
    end if;
    if (select count(*) from jsonb_array_elements(coalesce(manifest->'memories','[]'::jsonb))) <>
      (select count(distinct e->>'memoryId') from jsonb_array_elements(coalesce(manifest->'memories','[]'::jsonb)) e) then
      raise exception 'WORKFLOW_GENERATION_DUPLICATE' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(coalesce(manifest->'memories','[]'::jsonb)) loop
      perform 1 from public.agent_core_workflow_memory_versions v join public.agent_core_memory_records m
        on m.principal_id = v.principal_id and m.project_id = v.project_id and m.memory_id = v.memory_id and m.document = v.document
        where v.principal_id = principal and v.project_id = project and v.memory_id = (item->>'memoryId')::uuid and v.content_hash = item->>'contentHash';
      if not found then raise exception 'WORKFLOW_GENERATION_MEMORY_MISMATCH' using errcode = '23505'; end if;
    end loop;
    insert into public.agent_core_workflow_generations(principal_id,project_id,generation_id,manifest,serialized_manifest)
      values(principal,project,generation,manifest,serialized)
      on conflict(principal_id,project_id,generation_id) do nothing;
    if current_generation = generation then
      return jsonb_build_object('applied',true,'generationId',generation,'logicalStateHash',generation,'version',old_token,'recordCount',jsonb_array_length(manifest->'records'));
    end if;
    insert into public.agent_core_workflow_heads(principal_id,project_id,generation_id) values(principal,project,generation)
      on conflict(principal_id,project_id) do update set generation_id = excluded.generation_id,version_token = gen_random_uuid(),updated_at = now()
      returning version_token into new_token;
    return jsonb_build_object('applied',true,'generationId',generation,'logicalStateHash',generation,'version',new_token,'recordCount',jsonb_array_length(manifest->'records'));
  elsif operation in ('workflow_list','workflow_generation_get') then
    select generation_id,version_token into generation,old_token from public.agent_core_workflow_heads
      where principal_id = principal and project_id = project;
    if payload->>'generationId' is not null then generation := payload->>'generationId'; end if;
    select g.manifest into manifest from public.agent_core_workflow_generations g
      where g.principal_id = principal and g.project_id = project and g.generation_id = generation;
    if manifest is null then return null; end if;
    return jsonb_build_object('generationId',generation,'logicalStateHash',generation,'manifest',manifest,'version',old_token);
  end if;
  raise exception 'MEMORY_OPERATION_INVALID' using errcode = '22023';
end;
$function$;
revoke all on function public.agent_core_memory_base_call(text,jsonb), public.agent_core_memory_call(text,jsonb) from public, anon, authenticated;
grant execute on function public.agent_core_memory_base_call(text,jsonb), public.agent_core_memory_call(text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
