-- Admin console tables and the three reporting views the Finance/Analytics modules read.

create table if not exists public.changelog (
  id text primary key,
  version text not null,
  locale text not null default 'de',
  markdown text not null,
  published_at timestamptz not null default now()
);
create index if not exists changelog_published_idx on public.changelog (published_at desc);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  percentage smallint not null default 0 check (percentage between 0 and 100),
  users jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lemma_overrides (
  id text primary key,
  language text not null,
  lemma text not null,
  patch jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists lemma_overrides_uq on public.lemma_overrides (language, lemma);

create table if not exists public.languages (
  target text not null,
  native text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (target, native)
);
insert into public.languages (target, native, enabled) values ('es', 'de', false)
  on conflict do nothing;

-- RLS: changelog, feature_flags and languages are readable by everyone signed in (the app reads
-- them at launch); writes are admin-only. lemma_overrides is staff-only.
alter table public.changelog enable row level security;
drop policy if exists changelog_read on public.changelog;
create policy changelog_read on public.changelog for select using (auth.role() = 'authenticated');
drop policy if exists changelog_admin on public.changelog;
create policy changelog_admin on public.changelog for all using (public.is_admin()) with check (public.is_admin());

alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags for select using (auth.role() = 'authenticated');
drop policy if exists feature_flags_admin on public.feature_flags;
create policy feature_flags_admin on public.feature_flags for all using (public.is_admin()) with check (public.is_admin());

alter table public.languages enable row level security;
drop policy if exists languages_read on public.languages;
create policy languages_read on public.languages for select using (true);
drop policy if exists languages_admin on public.languages;
create policy languages_admin on public.languages for all using (public.is_admin()) with check (public.is_admin());

alter table public.lemma_overrides enable row level security;
drop policy if exists lemma_overrides_staff on public.lemma_overrides;
create policy lemma_overrides_staff on public.lemma_overrides for all using (public.is_staff()) with check (public.is_staff());

-- Reporting views -----------------------------------------------------------

create or replace view public.llm_usage_daily as
select
  (created_at at time zone 'UTC')::date as day,
  count(distinct story_id)::int as stories,
  round(sum(cost_cents)::numeric, 2)::float8 as cost_cents
from public.llm_usage
group by 1
order by 1 desc;

-- Revenue over the last 30 days. Amounts come from the token ledger (purchases carry ref_id with
-- a source prefix: 'stripe:', 'apple:', 'google:'); support payments are recorded as reason
-- 'support' with the amount in delta cents by the Stripe webhook.
create or replace view public.revenue as
with recent as (
  select * from public.token_ledger where created_at > now() - interval '30 days'
),
settings as (
  select
    coalesce((select (value_json ->> 'premium_cents')::int from public.app_settings where key = 'prices'), 1299) as premium_cents,
    coalesce((select (value_json ->> 'tokens_10_cents')::int from public.app_settings where key = 'prices'), 299) as tokens_10_cents,
    coalesce((select (value_json ->> 'tokens_50_cents')::int from public.app_settings where key = 'prices'), 999) as tokens_50_cents
)
select
  coalesce((select sum(case when delta = 10 then tokens_10_cents when delta = 50 then tokens_50_cents else 0 end)
            from recent, settings where reason = 'purchase' and ref_id like 'stripe:%'), 0)::int
    + coalesce((select count(*) * premium_cents from recent, settings where reason = 'premium' and ref_id like 'stripe:%'), 0)::int
    as stripe_cents_30d,
  coalesce((select sum(case when delta = 10 then tokens_10_cents when delta = 50 then tokens_50_cents else 0 end)
            from recent, settings where reason = 'purchase' and (ref_id like 'apple:%' or ref_id like 'google:%')), 0)::int
    + coalesce((select count(*) * premium_cents from recent, settings where reason = 'premium' and (ref_id like 'apple:%' or ref_id like 'google:%')), 0)::int
    as iap_cents_30d,
  coalesce((select sum(case when delta = -10 then tokens_10_cents when delta = -50 then tokens_50_cents else 0 end)
            from recent, settings where reason = 'chargeback'), 0)::int as refunds_cents_30d,
  coalesce((select sum(delta) from recent where reason = 'purchase'), 0)::int as tokens_sold_30d,
  coalesce((select sum(delta) from recent where reason = 'support'), 0)::int as supporters_cents_30d;

create or replace view public.analytics as
with active as (
  select user_id, max(reviewed_at) as last_review from public.review_events group by user_id
),
gen as (
  select
    count(*) filter (where status in ('ready', 'published'))::int as ok,
    count(*)::int as total
  from public.stories where source = 'ai' and created_at > now() - interval '30 days'
),
onboarded as (
  select count(*)::int as n from public.users where created_at > now() - interval '30 days'
),
first_session as (
  select count(distinct e.user_id)::int as n
  from public.review_events e join public.users u on u.id = e.user_id
  where u.created_at > now() - interval '30 days'
),
day7 as (
  select count(distinct e.user_id)::int as n
  from public.review_events e join public.users u on u.id = e.user_id
  where u.created_at > now() - interval '30 days' and e.reviewed_at > u.created_at + interval '7 days'
)
select
  (select count(*) from active where last_review > now() - interval '1 day')::int as dau,
  (select count(*) from active where last_review > now() - interval '7 days')::int as wau,
  jsonb_build_object(
    'onboarded', (select n from onboarded),
    'first_session', (select n from first_session),
    'day7', (select n from day7)
  ) as funnel,
  (select case when total = 0 then 1.0 else ok::float8 / total end from gen) as story_success_rate,
  coalesce((
    select jsonb_object_agg(mode, minutes) from (
      select mode, round(count(*) * 0.12)::int as minutes
      from public.review_events where reviewed_at > now() - interval '30 days' group by mode
    ) m
  ), '{}'::jsonb) as minutes_by_mode;

grant select on public.llm_usage_daily, public.revenue, public.analytics to authenticated;
