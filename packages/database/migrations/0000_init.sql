-- Language Master initial schema. Kept in sync with src/schema.ts by hand for v0.1;
-- later migrations are generated with `pnpm --filter @lm/database generate`.

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text,
  native_language text not null default 'de',
  active_target_language text not null default 'es',
  is_over_16 boolean not null default false,
  age_band text,
  avatar text not null default 'initials',
  profile_visibility text not null default 'private',
  last_login_at timestamptz not null default now(),
  retention_warned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists user_languages (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, language)
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_json jsonb not null default '{}'::jsonb,
  sound_on boolean not null default true,
  haptics_on boolean not null default true,
  daily_new_cards integer not null default 10,
  timezone text not null default 'Europe/Berlin',
  learning_days jsonb not null default '[1,2,3,4,5]'::jsonb,
  vacation_until text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists streak_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  "from" text,
  "to" text,
  at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists streak_log_user_idx on streak_log(user_id);

create table if not exists user_words (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  lemma text not null,
  translation text not null,
  pos text not null default 'other',
  dictionary_ref text,
  srs_stability real,
  srs_difficulty real,
  srs_due_at timestamptz,
  srs_reps integer not null default 0,
  srs_lapses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists user_words_lemma_uq on user_words(user_id, language, lemma);
create index if not exists user_words_updated_idx on user_words(user_id, updated_at);

create table if not exists card_variants (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null references user_words(id) on delete cascade,
  kind text not null,
  front text not null,
  back text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists card_variants_word_idx on card_variants(word_id);

create table if not exists word_sentences (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null references user_words(id) on delete cascade,
  position smallint not null,
  text text not null,
  translation text not null,
  source text not null,
  story_id text,
  sentence_id text,
  audio_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists word_sentences_word_idx on word_sentences(word_id);

create table if not exists response_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id text not null references card_variants(id) on delete cascade,
  prompt_kind text not null,
  ema_ms integer not null,
  n integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (variant_id, prompt_kind)
);

create table if not exists review_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id text not null,
  word_id text not null,
  grade smallint not null check (grade between 1 and 4),
  reaction_ms integer,
  mode text not null,
  prompt_kind text,
  reviewed_at timestamptz not null,
  supersedes text,
  manual boolean not null default false,
  received_at timestamptz not null default now()
);
create index if not exists review_events_user_word_idx on review_events(user_id, word_id);
create index if not exists review_events_user_received_idx on review_events(user_id, received_at);

create table if not exists lists (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  title text not null,
  description text,
  colour text not null default 'sage',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists lists_user_updated_idx on lists(user_id, updated_at);

create table if not exists list_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id text not null references lists(id) on delete cascade,
  word_id text not null references user_words(id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (list_id, word_id)
);
create index if not exists list_words_user_updated_idx on list_words(user_id, updated_at);

create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_premium boolean not null default false,
  story_tokens integer not null default 0,
  is_supporter boolean not null default false,
  supporter_since timestamptz,
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists token_ledger (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists token_ledger_user_idx on token_ledger(user_id);
create unique index if not exists token_ledger_ref_uq on token_ledger(reason, ref_id);

create table if not exists consents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null,
  version integer not null,
  accepted_at timestamptz not null default now(),
  ip_hash text
);
create index if not exists consents_user_idx on consents(user_id);

create table if not exists legal_documents (
  id text primary key,
  document text not null,
  locale text not null default 'de',
  version integer not null,
  markdown text not null,
  published_at timestamptz,
  requires_reconsent boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists legal_documents_uq on legal_documents(document, locale, version);

create table if not exists lectures (
  id text primary key,
  language text not null,
  slug text not null,
  version integer not null default 1,
  status text not null default 'draft',
  content_json jsonb not null,
  sort_order integer not null default 0,
  edges_json jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lectures_uq on lectures(language, slug, version);

create table if not exists lecture_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lecture_id text not null,
  done_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, lecture_id)
);

create table if not exists dictionary_packs (
  id text primary key,
  target text not null,
  native text not null,
  version integer not null,
  url text not null,
  bytes bigint not null,
  sha256 text not null,
  with_audio boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists dictionary_packs_uq on dictionary_packs(target, native, version, with_audio);

create table if not exists stories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  language text not null,
  native text not null default 'de',
  title text not null,
  theme text not null,
  grammar_focus text,
  level smallint not null default 1,
  source text not null,
  status text not null default 'ready',
  document_json jsonb not null,
  source_lists jsonb not null default '[]'::jsonb,
  generation_cost_cents real not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists stories_user_updated_idx on stories(user_id, updated_at);

create table if not exists llm_usage (
  id text primary key,
  story_id text,
  user_id uuid,
  step text not null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_cents real not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists llm_usage_created_idx on llm_usage(created_at);

create table if not exists app_settings (
  key text primary key,
  value_json jsonb not null,
  version integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id text primary key,
  actor uuid,
  table_name text not null,
  row_id text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_at_idx on audit_log(at);

create table if not exists jobs (
  id text primary key,
  name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  summary jsonb
);
create index if not exists jobs_name_started_idx on jobs(name, started_at);

create table if not exists analytics_events (
  id text primary key,
  user_id uuid,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists analytics_events_at_idx on analytics_events(at);

create table if not exists deleted_accounts (
  id text primary key,
  email_hash text not null,
  purchase_total_cents integer not null default 0,
  token_purchases integer not null default 0,
  was_premium boolean not null default false,
  deleted_at timestamptz not null default now(),
  keep_until timestamptz not null default (now() + interval '10 years')
);

-- Create a profile row and entitlement row for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, username, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'user'), '@', 1)), new.email)
  on conflict (id) do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
