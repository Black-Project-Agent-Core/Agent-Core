-- Searchable server-side projection of scoped canonical memory records.
begin;
create table if not exists public.agent_core_memory_records (
  principal_id text not null,
  project_id text not null,
  memory_id uuid not null,
  canonical_key text not null,
  document jsonb not null,
  version_token uuid not null default gen_random_uuid(),
  search_vector tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(document #>> '{entry,canonicalKey}', '') || ' ' ||
      coalesce(document #>> '{entry,title}', '') || ' ' || coalesce(document #>> '{entry,valueText}', '') || ' ' ||
      coalesce((document #> '{entry,anchors}')::text, ''))
  ) stored,
  synced_at timestamptz not null default now(),
  primary key (principal_id, project_id, memory_id),
  unique (principal_id, project_id, canonical_key),
  check (length(principal_id) between 1 and 1000 and length(project_id) between 0 and 4096),
  check (octet_length(document::text) <= 3145728)
);
create index if not exists agent_core_memory_records_search_idx on public.agent_core_memory_records using gin(search_vector);
alter table public.agent_core_memory_records enable row level security;
revoke all on table public.agent_core_memory_records from public, anon, authenticated;
grant select, insert, update on table public.agent_core_memory_records to service_role;

create or replace function public.agent_core_memory_call(operation text, payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  principal text := payload->>'principalId';
  project text := payload->>'projectId';
  doc jsonb;
  old_doc jsonb;
  old_token uuid;
  new_token uuid;
  identifier uuid;
  result jsonb;
  query tsquery;
  item_limit integer;
begin
  if operation = 'health' then
    perform 1 from public.agent_core_memory_records limit 1;
    return jsonb_build_object('schemaVersion', 1);
  end if;
  if coalesce(btrim(principal), '') = '' or project is null then
    raise exception 'MEMORY_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if operation = 'upsert' then
    doc := payload->'document';
    identifier := (doc #>> '{entry,memoryId}')::uuid;
    if doc is null or identifier is null or doc->>'principalId' is distinct from principal
      or doc->>'projectId' is distinct from project
      or coalesce(doc #>> '{entry,canonicalKey}', '') = ''
      or jsonb_typeof(doc->'revisions') is distinct from 'array'
      or jsonb_typeof(doc #> '{entry,relations}') is distinct from 'array'
      or (doc #>> '{entry,revisionNo}')::integer < 1 then
      raise exception 'MEMORY_DOCUMENT_INVALID' using errcode = '22023';
    end if;
    -- Serialize competing writes, including concurrent first inserts into one canonical key.
    perform pg_advisory_xact_lock(hashtextextended(principal || chr(10) || project, 0));
    select document, version_token into old_doc, old_token from public.agent_core_memory_records
      where principal_id = principal and project_id = project and memory_id = identifier for update;
    if old_doc is not null and old_doc <> doc then
      if old_token is distinct from (payload->>'expectedVersion')::uuid
        or (old_doc #>> '{entry,revisionNo}')::integer > (doc #>> '{entry,revisionNo}')::integer
        or (old_doc #>> '{entry,updatedAt}')::numeric > (doc #>> '{entry,updatedAt}')::numeric
        or ((old_doc #>> '{entry,revisionNo}')::integer = (doc #>> '{entry,revisionNo}')::integer
          and old_doc #>> '{entry,revisionId}' is distinct from doc #>> '{entry,revisionId}') then
        raise exception 'MEMORY_WRITE_CONFLICT' using errcode = '23505';
      end if;
    end if;
    if old_doc = doc then
      return jsonb_build_object('applied', true, 'version', old_token);
    end if;
    insert into public.agent_core_memory_records (principal_id, project_id, memory_id, canonical_key, document)
      values (principal, project, identifier, doc #>> '{entry,canonicalKey}', doc)
      on conflict (principal_id, project_id, memory_id) do update
        set canonical_key = excluded.canonical_key, document = excluded.document,
          version_token = gen_random_uuid(), synced_at = now()
      returning version_token into new_token;
    return jsonb_build_object('applied', true, 'version', new_token);
  elsif operation = 'get' then
    select document into result from public.agent_core_memory_records
      where principal_id = principal and project_id = project and memory_id = (payload->>'memoryId')::uuid;
    return result;
  elsif operation = 'search' then
    if length(coalesce(payload->>'query', '')) not between 1 and 20000 then
      raise exception 'MEMORY_QUERY_INVALID' using errcode = '22023';
    end if;
    item_limit := greatest(1, least(100, coalesce((payload->>'limit')::integer, 24)));
    query := websearch_to_tsquery('simple'::regconfig, payload->>'query');
    select coalesce(jsonb_agg(item order by score desc, memory_id), '[]'::jsonb) into result from (
      select document || jsonb_build_object('revisions', '[]'::jsonb) as item, memory_id,
        ts_rank_cd(search_vector, query) as score
      from public.agent_core_memory_records
      where principal_id = principal and project_id = project
        and document #>> '{entry,state}' <> 'tombstoned' and search_vector @@ query
      order by score desc, memory_id limit item_limit
    ) matches;
    return result;
  end if;
  raise exception 'MEMORY_OPERATION_INVALID' using errcode = '22023';
end;
$function$;
revoke all on function public.agent_core_memory_call(text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_core_memory_call(text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
