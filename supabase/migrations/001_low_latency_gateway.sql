create extension if not exists pgcrypto;

create table if not exists public.ai_provider_connections (
  id text primary key,
  provider_id text not null,
  label text,
  base_url text not null,
  format text not null default 'openai',
  credentials_json jsonb not null default '{}'::jsonb,
  provider_data_json jsonb not null default '{}'::jsonb,
  models_json jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  priority integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists ai_provider_connections_active_idx on public.ai_provider_connections(enabled, priority, provider_id);

create table if not exists public.ai_api_key_policies (
  id text primary key,
  key_hash text not null unique,
  name text,
  scopes_json jsonb not null default '[]'::jsonb,
  allowed_models_json jsonb not null default '[]'::jsonb,
  allowed_endpoints_json jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  expires_at timestamptz,
  budget_cents bigint,
  token_limit bigint,
  created_at timestamptz not null default now()
);
create index if not exists ai_api_key_policies_hash_idx on public.ai_api_key_policies(key_hash) where enabled;

create table if not exists public.ai_model_overrides (
  provider_id text not null,
  model_id text not null,
  display_name text,
  capabilities_json jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(provider_id, model_id)
);

create table if not exists public.ai_provider_request_limits (
  provider_id text primary key,
  last_request_at timestamptz,
  daily_window date not null default current_date,
  daily_request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_queue (
  id uuid primary key,
  api_key_id text,
  provider_id text not null,
  model text not null,
  endpoint text not null,
  status text not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending','leased','synced','dead_letter')),
  lease_id uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  batch_id text
);
create index if not exists ai_usage_queue_claim_idx on public.ai_usage_queue(state, lease_expires_at, created_at);

create table if not exists public.ai_parad_batches (
  batch_id text primary key,
  event_count integer not null,
  parad_version bigint,
  status text not null default 'succeeded',
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  error text
);

create or replace function public.reserve_provider_request(p_provider_id text, p_minimum_interval_ms integer, p_daily_request_limit integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ai_provider_request_limits; now_ts timestamptz := clock_timestamp(); day date := (now_ts at time zone 'utc')::date; elapsed numeric; count_now integer;
begin
  insert into public.ai_provider_request_limits(provider_id, daily_window, updated_at) values (p_provider_id, day, now_ts)
  on conflict (provider_id) do nothing;
  select * into r from public.ai_provider_request_limits where provider_id = p_provider_id for update;
  count_now := case when r.daily_window = day then r.daily_request_count else 0 end;
  elapsed := extract(epoch from (now_ts - coalesce(r.last_request_at, now_ts))) * 1000;
  if elapsed < p_minimum_interval_ms then
    return jsonb_build_object('allowed',false,'reason','minute','retryAfterSeconds',greatest(1,ceil((p_minimum_interval_ms-elapsed)/1000)),'dailyRequestCount',count_now,'dailyRequestLimit',p_daily_request_limit);
  end if;
  if count_now >= p_daily_request_limit then
    return jsonb_build_object('allowed',false,'reason','daily','retryAfterSeconds',greatest(1,ceil(extract(epoch from ((day+1)::timestamp at time zone 'utc'-now_ts)))),'dailyRequestCount',count_now,'dailyRequestLimit',p_daily_request_limit);
  end if;
  update public.ai_provider_request_limits set last_request_at=now_ts, daily_window=day, daily_request_count=count_now+1, updated_at=now_ts where provider_id=p_provider_id;
  return jsonb_build_object('allowed',true,'reason',null,'retryAfterSeconds',0,'dailyRequestCount',count_now+1,'dailyRequestLimit',p_daily_request_limit);
end $$;

create or replace function public.claim_usage_batch(p_limit integer default 250, p_lease_seconds integer default 300)
returns setof public.ai_usage_queue language sql security definer set search_path = public as $$
with candidates as (select id from public.ai_usage_queue where state='pending' or (state='leased' and lease_expires_at < now()) order by created_at limit p_limit for update skip locked)
update public.ai_usage_queue q set state='leased', lease_id=gen_random_uuid(), lease_expires_at=now()+make_interval(secs=>p_lease_seconds), attempts=attempts+1 from candidates c where q.id=c.id returning q.*;
$$;

create or replace function public.complete_usage_batch(p_ids uuid[], p_batch_id text, p_error text default null)
returns void language sql security definer set search_path = public as $$
update public.ai_usage_queue set state=case when p_error is null then 'synced' else case when attempts >= 5 then 'dead_letter' else 'pending' end end, batch_id=p_batch_id, last_error=p_error, lease_id=null, lease_expires_at=null where id=any(p_ids);
$$;
