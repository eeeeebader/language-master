-- Row level security. User-owned rows: user_id = auth.uid(). Admin tables: role claim.
-- The API uses the service role and bypasses RLS; the client and admin talk to PostgREST through it.

create or replace function public.is_staff() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role') in ('admin', 'editor', 'analyst');
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role') = 'admin';
$$;

-- user-owned tables -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_languages','user_settings','streak_log','user_words','card_variants','word_sentences',
    'response_profiles','review_events','lists','list_words','lecture_progress','consents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select using (public.is_staff())', t || '_staff_read', t);
  end loop;
end $$;

-- users: own row read/write, staff read
alter table public.users enable row level security;
drop policy if exists users_self on public.users;
create policy users_self on public.users for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists users_staff_read on public.users;
create policy users_staff_read on public.users for select using (public.is_staff());

-- entitlements and token ledger: read own, written only by the API (service role) or admins
alter table public.entitlements enable row level security;
drop policy if exists entitlements_self_read on public.entitlements;
create policy entitlements_self_read on public.entitlements for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists entitlements_admin_write on public.entitlements;
create policy entitlements_admin_write on public.entitlements for all using (public.is_admin()) with check (public.is_admin());

alter table public.token_ledger enable row level security;
drop policy if exists token_ledger_self_read on public.token_ledger;
create policy token_ledger_self_read on public.token_ledger for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists token_ledger_admin_write on public.token_ledger;
create policy token_ledger_admin_write on public.token_ledger for insert with check (public.is_admin());

-- stories: own rows, published official texts for everyone, staff everything
alter table public.stories enable row level security;
drop policy if exists stories_owner on public.stories;
create policy stories_owner on public.stories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists stories_official_read on public.stories;
create policy stories_official_read on public.stories for select using (user_id is null and status = 'published');
drop policy if exists stories_staff on public.stories;
create policy stories_staff on public.stories for all using (public.is_staff()) with check (public.is_staff());

-- published content readable by all, editable by staff
do $$
declare t text;
begin
  foreach t in array array['lectures','legal_documents','dictionary_packs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select using (published_at is not null or public.is_staff())', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_write', t);
    execute format('create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())', t || '_staff_write', t);
  end loop;
end $$;

-- admin-only tables
do $$
declare t text;
begin
  foreach t in array array['app_settings','audit_log','jobs','llm_usage','analytics_events','deleted_accounts','schema_migrations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for select using (public.is_staff())', t || '_staff', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

-- app_settings: the client reads a few public keys (enabled languages, maintenance flag)
drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings for select
  using (key in ('languages.enabled', 'maintenance', 'stories.free_per_day'));
