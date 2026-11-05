-- Durable operations events for the admin "Betrieb" module: API errors, client-reported pack
-- download failures, service checks. Staff-readable; written by the API (service role).
create table if not exists public.ops_events (
  id text primary key,
  kind text not null,          -- api_error | pack_failure | health
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists ops_events_kind_at_idx on public.ops_events (kind, at desc);
alter table public.ops_events enable row level security;
drop policy if exists ops_events_staff on public.ops_events;
create policy ops_events_staff on public.ops_events for select using (public.is_staff());
